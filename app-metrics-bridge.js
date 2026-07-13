// Transitional compatibility bridge: the existing editor still defines several
// calculation helpers in app.js. Replace their live bindings with core functions
// so editor/server/widget use the same recurrence, workload, and condition rules.
(function installBoardMetricsBridge() {
  if (typeof BoardMetrics === "undefined") return;

  const appCalendar = {
    isHoliday(date) {
      return typeof getHolidayName === "function" && Boolean(getHolidayName(date));
    },
    isWorkday(date) {
      const parsed = new Date(`${date}T00:00:00`);
      const day = parsed.getDay();
      return day !== 0 && day !== 6 && !this.isHoliday(date);
    },
  };

  getRecurringEntry = (task, date) => BoardMetrics.getRecurringEntry(task, date);
  mergeEntries = (baseEntry, overrideEntry) => BoardMetrics.mergeEntries(baseEntry, overrideEntry);
  isWorkday = (date) => BoardMetrics.isWorkday(date, appCalendar);
  hasTaskWorkOn = (task, date) => BoardMetrics.hasTaskWorkOn(task, date, appCalendar);
  getTaskWorkloadOn = (task, date) => BoardMetrics.getTaskWorkloadOn(task, date);
  getTaskWorkload = (task) => BoardMetrics.getTaskWorkload(task);
  getTaskHours = (task) => BoardMetrics.getTaskHours(task);
  hoursToWorkload = (hours) => BoardMetrics.hoursToWorkload(hours);
  weightToHours = (weight) => BoardMetrics.weightToHours(weight);
  getEnergyForDate = (date) => BoardMetrics.getEnergyForDate(state, date);

  invalidateDerivedCaches();
  render();
})();
