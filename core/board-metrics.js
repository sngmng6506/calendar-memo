(function initBoardMetrics(root, factory) {
  const calendar =
    typeof module !== "undefined" && module.exports
      ? require("./holiday-calendar")
      : root.BoardCalendar;
  const api = factory(calendar);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BoardMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBoardMetrics(BoardCalendar) {
  const dayMs = 24 * 60 * 60 * 1000;
  const energyMax = 120;

  function getTodaySummary(board, date) {
    const targetDate = isDateKey(date) ? date : getKoreaDateKey();
    const tasks = Array.isArray(board && board.tasks) ? board.tasks : [];
    const items = tasks
      .filter((task) => task && !task.completed)
      .filter((task) => hasTaskWorkOn(task, targetDate))
      .map((task) => {
        const companyProject = isCompanyProjectTaskType(task);
        return {
          id: task.id,
          name: task.name || "Untitled",
          fixed: Boolean(task.fixed),
          companyProject,
          includedInTotal: !companyProject,
          workload: companyProject ? 0 : roundOne(getTaskWorkloadOn(task, targetDate)),
        };
      });

    const workload = roundOne(
      items.reduce((sum, item) => sum + (item.includedInTotal ? item.workload : 0), 0),
    );
    const condition = getEnergyForDate(board, targetDate);
    const conditionScore = condition.value === null ? null : Math.round((condition.value / energyMax) * 100);

    return {
      date: targetDate,
      workload,
      condition,
      status: getLoadStatus(workload, conditionScore),
      items,
    };
  }

  function getRangeSummary(board, start, days = 30) {
    const startDate = isDateKey(start) ? start : getKoreaDateKey();
    const dayCount = clamp(Math.round(Number(days) || 30), 1, 120);
    const dates = Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(startDate, index);
      const summary = getTodaySummary(board, date);
      return {
        date,
        workload: summary.workload,
        condition: summary.condition,
        status: summary.status,
        items: summary.items,
        milestones: getMilestonesForDate(board, date),
      };
    });

    return {
      start: startDate,
      days: dayCount,
      dates,
      tasks: getWidgetTasks(board),
    };
  }

  function getEnergyForDate(board, date) {
    const energy = board && board.energy && typeof board.energy === "object" ? board.energy : {};
    if (energy[date] !== undefined) {
      return { value: clamp(Number(energy[date]), 0, energyMax), type: "actual" };
    }

    const samples = getEnergySamples(energy);
    if (samples.length === 0) return { value: null, type: "missing" };

    const targetTime = dateToTime(date);
    const last = samples.at(-1);
    if (targetTime > last.time) return { value: forecastEnergy(targetTime, samples), type: "forecast" };
    return { value: estimateEnergy(targetTime, samples), type: "estimated" };
  }

  function getEnergySamples(energy) {
    return Object.entries(energy)
      .map(([date, value]) => ({
        date,
        time: dateToTime(date),
        value: clamp(Number(value), 0, energyMax),
      }))
      .filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.time))
      .sort((a, b) => a.time - b.time);
  }

  function estimateEnergy(targetTime, samples, tau = 3.5) {
    let weightedSum = 0;
    let totalWeight = 0;

    samples.forEach((sample) => {
      const daysAway = Math.abs(sample.time - targetTime) / dayMs;
      const weight = Math.exp(-daysAway / tau);
      weightedSum += sample.value * weight;
      totalWeight += weight;
    });

    return Math.round(clamp(weightedSum / totalWeight, 0, energyMax));
  }

  function forecastEnergy(targetTime, samples) {
    const last = samples.at(-1);
    const previous = samples.length > 1 ? samples.at(-2) : last;
    const daysAhead = Math.max(0, (targetTime - last.time) / dayMs);
    const dayGap = Math.max(1, (last.time - previous.time) / dayMs);
    const recentSlope = (last.value - previous.value) / dayGap;
    const baseline = 90;
    const decay = Math.exp(-daysAhead / 10);
    const trend = recentSlope * daysAhead * Math.exp(-daysAhead / 5);
    const wave = Math.sin((daysAhead / 3) * Math.PI) * 6 * Math.exp(-daysAhead / 12);
    const value = baseline + (last.value - baseline) * decay + trend + wave;

    return Math.round(clamp(value, 0, energyMax));
  }

  function hasTaskWorkOn(task, date, calendar = BoardCalendar) {
    if (!task || !isDateKey(date)) return false;
    const entries = task.entries || {};
    if (task.fixed) return isWorkday(date, calendar) || Boolean(entries[date]);
    return Boolean(mergeEntries(getRecurringEntry(task, date), entries[date]));
  }

  function getTaskWorkloadOn(task, date) {
    const entry = task && task.entries && task.entries[date];
    if (entry && entry.workload != null && Number.isFinite(Number(entry.workload))) {
      return Math.max(0, Number(entry.workload));
    }
    return getTaskWorkload(task);
  }

  function getTaskWorkload(task) {
    if (!task || isCompanyProjectTaskType(task)) return 0;
    return hoursToWorkload(getTaskHours(task));
  }

  function getTaskHours(task) {
    if (!task || isCompanyProjectTaskType(task)) return 0;
    if (Number.isFinite(Number(task.hours)) && task.hours !== null && task.hours !== "") return Number(task.hours);
    return weightToHours(task.weight) || 0;
  }

  function getRecurringEntry(task, date) {
    if (!task || !task.recurring || !isDateKey(date)) return null;
    if (isDateKey(task.start) && date < task.start) return null;
    if (isDateKey(task.end) && date > task.end) return null;
    if (task.recurring.frequency !== "weekly") return null;

    const parsed = new Date(`${date}T00:00:00`);
    const weekdays = Array.isArray(task.recurring.weekdays) ? task.recurring.weekdays : [task.recurring.weekday];
    if (!weekdays.map(Number).includes(parsed.getDay())) return null;
    return { recurring: true, note: "정기 일정" };
  }

  function mergeEntries(baseEntry, overrideEntry) {
    if (!baseEntry) return overrideEntry;
    if (!overrideEntry) return baseEntry;
    return {
      ...baseEntry,
      ...overrideEntry,
      recurring: Boolean(baseEntry.recurring || overrideEntry.recurring),
      note: overrideEntry.note || baseEntry.note,
    };
  }

  function getMilestonesForDate(board, date) {
    const tasks = Array.isArray(board && board.tasks) ? board.tasks : [];
    return tasks
      .filter((task) => task && !task.completed)
      .filter((task) => task.entries && task.entries[date] && task.entries[date].milestone)
      .map((task) => ({
        taskId: task.id,
        taskName: task.name || "Untitled",
        progress: getTaskProgressThroughDate(task, date),
        note: task.entries[date].note || "",
      }));
  }

  function getWidgetTasks(board) {
    const tasks = Array.isArray(board && board.tasks) ? board.tasks : [];
    return tasks
      .filter((task) => task && !task.completed)
      .map((task) => ({
        id: task.id,
        name: task.name || "Untitled",
        fixed: Boolean(task.fixed),
        companyProject: Boolean(task.companyProject),
        parentId: task.parentId || null,
        start: task.start || null,
        end: task.end || null,
      }));
  }

  function getTaskProgressThroughDate(task, date) {
    const entries = task && task.entries && typeof task.entries === "object" ? task.entries : {};
    return clamp(
      Object.entries(entries).reduce((sum, [entryDate, entry]) => {
        if (entryDate > date) return sum;
        return sum + Number((entry && (entry.delta ?? entry.progressDelta)) || 0);
      }, 0),
      0,
      100,
    );
  }

  function getLoadStatus(load, conditionScore) {
    if (conditionScore === null) return "condition-missing";
    if (load >= 70 && conditionScore <= 50) return "overload";
    if (load > conditionScore + 15) return "warning";
    return "balanced";
  }

  function isCompanyProjectTaskType(task) {
    return Boolean(task && task.companyProject);
  }

  function hoursToWorkload(hours) {
    return (Math.max(0, Number(hours) || 0) / 12) * 100;
  }

  function weightToHours(weight) {
    if (!Number.isFinite(Number(weight)) || weight === null || weight === "") return null;
    return (Math.max(0, Number(weight)) / 100) * 12;
  }

  function isWorkday(date, calendar = BoardCalendar) {
    if (!isDateKey(date)) return false;
    if (calendar && typeof calendar.isWorkday === "function") return calendar.isWorkday(date);
    const day = new Date(`${date}T00:00:00`).getDay();
    if (day === 0 || day === 6) return false;
    return !(calendar && typeof calendar.isHoliday === "function" && calendar.isHoliday(date));
  }

  function getKoreaDateKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function addDays(date, days) {
    const parsed = new Date(`${date}T00:00:00`);
    parsed.setDate(parsed.getDate() + days);
    return toDateKey(parsed);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isDateKey(value) {
    if (BoardCalendar && typeof BoardCalendar.isDateKey === "function") return BoardCalendar.isDateKey(value);
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function dateToTime(date) {
    return new Date(`${date}T00:00:00`).getTime();
  }

  function roundOne(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    energyMax,
    getTodaySummary,
    getRangeSummary,
    getEnergyForDate,
    getTaskWorkloadOn,
    getTaskWorkload,
    getTaskHours,
    getRecurringEntry,
    hasTaskWorkOn,
    mergeEntries,
    getLoadStatus,
    hoursToWorkload,
    weightToHours,
    isWorkday,
    isDateKey,
    getKoreaDateKey,
  };
});
