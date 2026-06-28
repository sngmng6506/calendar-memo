const defaultDays = 21;
const maxAxis = 120;
const storageKey = "schedule-wave-board";

let rangeStart = todayKey();
let rangeDays = defaultDays;
let currentSummary = null;

const rangeLabel = document.querySelector("#rangeLabel");
const statusBar = document.querySelector("#statusBar");
const calendarGrid = document.querySelector("#calendarGrid");
const waveCanvas = document.querySelector("#waveCanvas");
const prevRange = document.querySelector("#prevRange");
const nextRange = document.querySelector("#nextRange");
const todayRange = document.querySelector("#todayRange");
const refreshWidget = document.querySelector("#refreshWidget");

prevRange.addEventListener("click", () => {
  rangeStart = addDays(rangeStart, -Math.floor(rangeDays / 2));
  loadWidget();
});

nextRange.addEventListener("click", () => {
  rangeStart = addDays(rangeStart, Math.floor(rangeDays / 2));
  loadWidget();
});

todayRange.addEventListener("click", () => {
  rangeStart = todayKey();
  loadWidget();
});

refreshWidget.addEventListener("click", () => loadWidget());
window.addEventListener("resize", () => drawWave(currentSummary));

loadWidget();

async function loadWidget() {
  setStatus("loading", "Loading schedule");
  try {
    currentSummary = await loadServerSummary();
    renderWidget(currentSummary);
    setStatus("ready", "Synced from server");
  } catch (error) {
    const localSummary = loadLocalSummary();
    if (localSummary) {
      currentSummary = localSummary;
      renderWidget(currentSummary);
      setStatus("ready", "Local mode");
      return;
    }
    currentSummary = null;
    renderEmpty("No local board data yet. Open the main app once to create a board.");
    drawWave(null);
    setStatus("error", error.message);
  }
}

async function loadServerSummary() {
  const res = await fetch(`/api/widget/range?start=${rangeStart}&days=${rangeDays}`);
  if (!res.ok) throw new Error("Server sync unavailable.");
  const data = await res.json();
  if (!data.summary) throw new Error("Widget data is unavailable.");
  return data.summary;
}

function loadLocalSummary() {
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : { tasks: [], energy: {} };
    const board = BoardSchema.normalizeBoard(parsed);
    return BoardMetrics.getRangeSummary(board, rangeStart, rangeDays);
  } catch {
    return null;
  }
}

function renderWidget(summary) {
  if (!summary || !Array.isArray(summary.dates)) {
    renderEmpty("No widget data.");
    return;
  }

  const endDate = addDays(summary.start, summary.days - 1);
  rangeLabel.textContent = `${formatDate(summary.start)} - ${formatDate(endDate)}`;
  calendarGrid.style.setProperty("--days", String(summary.days));
  calendarGrid.innerHTML = "";

  calendarGrid.append(createCell("header label", "Date"));
  summary.dates.forEach((day) => {
    const cell = createCell(`header${day.date === todayKey() ? " today" : ""}${isWeekend(day.date) ? " weekend" : ""}`);
    cell.innerHTML = `<span class="date-day">${weekday(day.date)}</span><strong class="date-num">${day.date.slice(8)}</strong>`;
    calendarGrid.append(cell);
  });

  const tasks = (summary.tasks || []).slice(0, 10);
  tasks.forEach((task) => {
    const label = createCell(`label task-label${task.fixed ? " company-row" : ""}${task.companyProject ? " company-project-row" : ""}`);
    label.innerHTML = `
      <strong>${escapeHtml(task.name)}</strong>
      <span>${formatTaskRange(task)}</span>
    `;
    calendarGrid.append(label);
    summary.dates.forEach((day) => {
      const item = (day.items || []).find((entry) => entry.id === task.id);
      const milestone = (day.milestones || []).find((entry) => entry.taskId === task.id);
      const classes = [
        "grid-cell",
        "task-cell",
        task.fixed ? "company-cell" : "",
        task.companyProject ? "company-project-cell" : "",
        item ? "has-work" : "",
        milestone ? "milestone" : "",
        day.date === todayKey() ? "today" : "",
        isWeekend(day.date) ? "weekend" : "",
      ].filter(Boolean);
      const cell = createCell(classes.join(" "));
      cell.innerHTML = `
        <span class="cell-markers">
          ${item ? '<i class="work-dot"></i>' : ""}
          ${milestone ? '<i class="milestone-dot"></i>' : ""}
        </span>
        ${item && !milestone ? `<span class="cell-note">${Math.round(item.workload)}%</span>` : ""}
        ${milestone?.note ? `<span class="cell-note">${escapeHtml(milestone.note)}</span>` : ""}
      `;
      calendarGrid.append(cell);
    });
  });

  drawWave(summary);
}

function drawWave(summary) {
  const rect = waveCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  waveCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  waveCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = waveCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!summary || !summary.dates || summary.dates.length < 2) return;

  const padX = 24;
  const padY = 42;
  const width = rect.width - padX * 2;
  const height = rect.height - padY * 2;

  drawLine(ctx, summary.dates.map((day) => Math.min(day.workload, maxAxis)), padX, padY, width, height, "#c94141", 0.34, true);
  drawLine(
    ctx,
    summary.dates.map((day) => (day.condition.value === null ? null : day.condition.value)),
    padX,
    padY,
    width,
    height,
    "#3467c2",
    0.44,
    false,
  );
}

function drawLine(ctx, values, x, y, width, height, color, alpha, fill) {
  const points = values
    .map((value, index) => {
      if (value === null || value === undefined) return null;
      return {
        x: x + (index / Math.max(1, values.length - 1)) * width,
        y: y + height - (Math.max(0, Math.min(maxAxis, value)) / maxAxis) * height,
      };
    })
    .filter(Boolean);
  if (points.length < 2) return;

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  if (!fill) return;
  ctx.lineTo(points.at(-1).x, y + height);
  ctx.lineTo(points[0].x, y + height);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.fill();
}

function renderEmpty(message) {
  rangeLabel.textContent = "Widget";
  calendarGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setStatus(state, text) {
  statusBar.dataset.state = state;
  statusBar.textContent = text;
}

function createCell(className, text = "") {
  const cell = document.createElement("div");
  cell.className = className.startsWith("grid-cell") ? className : `grid-cell ${className}`;
  cell.textContent = text;
  return cell;
}

function formatTaskRange(task) {
  if (task.fixed) return "Always";
  if (!task.start || !task.end) return "";
  return `${task.start.slice(5).replace("-", ".")} - ${task.end.slice(5).replace("-", ".")}`;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
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

function formatDate(date) {
  return date.replaceAll("-", ".");
}

function weekday(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function withAlpha(hex, alpha) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[character];
  });
}
