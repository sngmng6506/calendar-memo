import { getCurrentWindow } from "@tauri-apps/api/window";
import { attach, detach } from "tauri-plugin-wallpaper";

const STORAGE_KEY = "work-schedule-desktop-settings-v1";
const CACHE_KEY = "work-schedule-desktop-cache-v1";
const DEFAULT_SETTINGS = {
  serverUrl: "",
  token: "",
  days: 14,
  opacity: 86,
  attached: true,
};

let settings = loadSettings();
let rangeStart = todayKey();
let summary = null;
let activeEnergyDate = null;
let attached = false;

const timelineGrid = document.querySelector("#timelineGrid");
const rangeLabel = document.querySelector("#rangeLabel");
const syncBadge = document.querySelector("#syncBadge");
const graphPanel = document.querySelector("#graphPanel");
const conditionCanvas = document.querySelector("#conditionCanvas");
const energyDialog = document.querySelector("#energyDialog");
const energyForm = document.querySelector("#energyForm");
const energyDateLabel = document.querySelector("#energyDateLabel");
const energyRange = document.querySelector("#energyRange");
const energyOutput = document.querySelector("#energyOutput");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const serverUrl = document.querySelector("#serverUrl");
const widgetToken = document.querySelector("#widgetToken");
const rangeDays = document.querySelector("#rangeDays");
const panelOpacity = document.querySelector("#panelOpacity");
const setupUrlHelp = document.querySelector("#setupUrlHelp");
const toggleAttach = document.querySelector("#toggleAttach");

init();

async function init() {
  applyOpacity();
  bindEvents();
  if (!settings.serverUrl || !settings.token) {
    openSettingsDialog();
    setSyncStatus("idle", "설정 필요");
    return;
  }
  if (settings.attached) await setAttached(true);
  await loadBoard();
}

function bindEvents() {
  document.querySelector("#prevRange").addEventListener("click", () => moveRange(-Math.max(1, Math.floor(settings.days / 2))));
  document.querySelector("#nextRange").addEventListener("click", () => moveRange(Math.max(1, Math.floor(settings.days / 2))));
  document.querySelector("#todayRange").addEventListener("click", () => {
    rangeStart = todayKey();
    loadBoard();
  });
  document.querySelector("#refreshBoard").addEventListener("click", () => loadBoard());
  document.querySelector("#toggleGraph").addEventListener("click", () => {
    graphPanel.hidden = !graphPanel.hidden;
    if (!graphPanel.hidden) drawGraph();
  });
  document.querySelector("#closeGraph").addEventListener("click", () => { graphPanel.hidden = true; });
  document.querySelector("#openSettings").addEventListener("click", openSettingsDialog);
  document.querySelector("#closeApp").addEventListener("click", () => getCurrentWindow().close());
  toggleAttach.addEventListener("click", () => setAttached(!attached));
  window.addEventListener("resize", drawGraph);

  energyRange.addEventListener("input", () => { energyOutput.value = energyRange.value; });
  document.querySelectorAll("[data-energy]").forEach((button) => {
    button.addEventListener("click", () => {
      energyRange.value = button.dataset.energy;
      energyOutput.value = button.dataset.energy;
    });
  });

  energyForm.addEventListener("submit", async (event) => {
    if (event.submitter?.id !== "saveEnergy") return;
    event.preventDefault();
    await saveEnergyValue(activeEnergyDate, Number(energyRange.value));
  });

  settingsForm.addEventListener("submit", async (event) => {
    if (event.submitter?.id !== "saveSettings") return;
    event.preventDefault();
    settings = {
      ...settings,
      serverUrl: normalizeServerUrl(serverUrl.value),
      token: widgetToken.value.trim(),
      days: Number(rangeDays.value) || 14,
      opacity: Number(panelOpacity.value) || 86,
    };
    saveSettings();
    applyOpacity();
    settingsDialog.close();
    if (settings.attached && !attached) await setAttached(true);
    await loadBoard();
  });

  serverUrl.addEventListener("input", updateSetupHelp);
  panelOpacity.addEventListener("input", () => {
    document.documentElement.style.setProperty("--panel-opacity", String(Number(panelOpacity.value) / 100));
  });
}

async function setAttached(next) {
  try {
    if (next) await attach("main");
    else await detach("main");
    attached = next;
    settings.attached = next;
    saveSettings();
    toggleAttach.textContent = next ? "일반 창으로 분리" : "바탕화면에 붙이기";
  } catch (error) {
    attached = false;
    settings.attached = false;
    saveSettings();
    toggleAttach.textContent = "바탕화면에 붙이기";
    setSyncStatus("error", `창 배치 실패: ${error}`);
  }
}

async function moveRange(days) {
  rangeStart = addDays(rangeStart, days);
  await loadBoard();
}

async function loadBoard() {
  if (!settings.serverUrl || !settings.token) {
    openSettingsDialog();
    return;
  }
  setSyncStatus("idle", "불러오는 중");
  try {
    const data = await apiFetch(`/api/widget/range?start=${encodeURIComponent(rangeStart)}&days=${settings.days}`);
    if (!data.summary) throw new Error("요약 데이터가 없습니다.");
    summary = data.summary;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ serverUrl: settings.serverUrl, summary, savedAt: Date.now() }));
    renderTimeline();
    drawGraph();
    setSyncStatus("online", "동기화됨");
  } catch (error) {
    const cached = loadCache();
    if (cached) {
      summary = cached.summary;
      renderTimeline();
      drawGraph();
      setSyncStatus("offline", "오프라인 캐시");
      return;
    }
    summary = null;
    renderEmpty(error.message || "서버에 연결할 수 없습니다.");
    setSyncStatus("error", "연결 실패");
  }
}

async function saveEnergyValue(date, value) {
  if (!date) return;
  setSyncStatus("idle", "저장 중");
  try {
    await apiFetch("/api/widget/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, value }),
    });
    energyDialog.close();
    await loadBoard();
  } catch (error) {
    setSyncStatus("error", "컨디션 저장 실패");
    window.alert(error.message || "컨디션을 저장하지 못했습니다.");
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${settings.serverUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error("위젯 토큰이 만료되었거나 올바르지 않습니다.");
    throw new Error(data.error || `서버 오류 (${response.status})`);
  }
  return data;
}

function renderTimeline() {
  if (!summary || !Array.isArray(summary.dates)) {
    renderEmpty("표시할 일정이 없습니다.");
    return;
  }
  document.documentElement.style.setProperty("--days", String(summary.days));
  const end = addDays(summary.start, summary.days - 1);
  rangeLabel.textContent = `${formatDate(summary.start)} — ${formatDate(end)}`;
  timelineGrid.innerHTML = "";

  const header = createRow("header-row");
  header.append(createCell("timeline-label", "날짜"));
  summary.dates.forEach((day) => {
    const classes = ["timeline-cell", day.date === todayKey() ? "today" : "", isWeekend(day.date) ? "weekend" : ""].filter(Boolean).join(" ");
    const cell = document.createElement("div");
    cell.className = classes;
    cell.innerHTML = `<span>${weekday(day.date)}</span><strong class="date-number">${day.date.slice(8)}</strong>`;
    header.append(cell);
  });
  timelineGrid.append(header);

  const conditionRow = createRow("condition-row");
  conditionRow.append(createTaskLabel("내 컨디션", "날짜 칸을 눌러 기록", "timeline-label"));
  summary.dates.forEach((day) => {
    const cell = createCell(`timeline-cell${day.date === todayKey() ? " today" : ""}${isWeekend(day.date) ? " weekend" : ""}`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "condition-cell";
    const value = day.condition?.value;
    button.innerHTML = value == null
      ? '<span class="condition-value">＋</span><span class="condition-type">기록</span>'
      : `<span class="condition-value">${Math.round(value)}</span><span class="condition-type">${conditionTypeLabel(day.condition.type)}</span>`;
    button.addEventListener("click", () => openEnergyDialog(day));
    cell.append(button);
    conditionRow.append(cell);
  });
  timelineGrid.append(conditionRow);

  (summary.tasks || []).forEach((task) => {
    const row = createRow(`${task.fixed ? "company-row" : ""} ${task.companyProject ? "company-project-row" : ""}`);
    row.append(createTaskLabel(task.name, formatTaskRange(task), "timeline-label"));
    summary.dates.forEach((day) => {
      const item = (day.items || []).find((entry) => entry.id === task.id);
      const milestone = (day.milestones || []).find((entry) => entry.taskId === task.id);
      const classes = [
        "timeline-cell",
        item ? "has-work" : "",
        milestone ? "milestone" : "",
        day.date === todayKey() ? "today" : "",
        isWeekend(day.date) ? "weekend" : "",
      ].filter(Boolean).join(" ");
      const cell = createCell(classes);
      const note = milestone?.note || (item && !task.companyProject && item.workload ? `${Math.round(item.workload)}%` : "");
      if (note) cell.append(createElement("span", "cell-note", note));
      cell.title = milestone?.note || task.name;
      row.append(cell);
    });
    timelineGrid.append(row);
  });
}

function renderEmpty(message) {
  rangeLabel.textContent = "연결되지 않음";
  timelineGrid.innerHTML = "";
  timelineGrid.append(createElement("div", "empty-state", message));
}

function openEnergyDialog(day) {
  activeEnergyDate = day.date;
  energyDateLabel.textContent = `${formatDate(day.date)} · 실제 컨디션만 저장됩니다.`;
  const value = day.condition?.type === "actual" ? day.condition.value : 80;
  energyRange.value = String(Math.round(value ?? 80));
  energyOutput.value = energyRange.value;
  energyDialog.showModal();
}

function openSettingsDialog() {
  serverUrl.value = settings.serverUrl;
  widgetToken.value = settings.token;
  rangeDays.value = String(settings.days);
  panelOpacity.value = String(settings.opacity);
  updateSetupHelp();
  settingsDialog.showModal();
}

function updateSetupHelp() {
  const base = normalizeServerUrl(serverUrl.value);
  setupUrlHelp.textContent = base
    ? `토큰 발급 페이지: ${base}/desktop-setup.html`
    : "웹앱에서 Google 로그인 후 /desktop-setup.html을 열어 토큰을 발급하세요.";
}

function drawGraph() {
  if (graphPanel.hidden || !summary || !Array.isArray(summary.dates)) return;
  const rect = conditionCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  conditionCanvas.width = Math.floor(rect.width * dpr);
  conditionCanvas.height = Math.floor(rect.height * dpr);
  const ctx = conditionCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const pad = 28;
  const width = rect.width - pad * 2;
  const height = rect.height - pad * 2;
  ctx.strokeStyle = "rgba(69, 88, 78, .13)";
  ctx.lineWidth = 1;
  [0, 30, 60, 90, 120].forEach((value) => {
    const y = pad + height - (value / 120) * height;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(rect.width - pad, y);
    ctx.stroke();
  });
  drawLine(ctx, summary.dates.map((day) => Math.min(120, Number(day.workload) || 0)), "#c9504d", pad, width, height);
  drawLine(ctx, summary.dates.map((day) => day.condition?.value ?? null), "#3b6fc1", pad, width, height);
}

function drawLine(ctx, values, color, pad, width, height) {
  const points = values.map((value, index) => value == null ? null : ({
    x: pad + (index / Math.max(1, values.length - 1)) * width,
    y: pad + height - (Math.max(0, Math.min(120, value)) / 120) * height,
  }));
  let drawing = false;
  ctx.beginPath();
  points.forEach((point) => {
    if (!point) { drawing = false; return; }
    if (!drawing) { ctx.moveTo(point.x, point.y); drawing = true; }
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function createRow(extraClass = "") {
  const row = document.createElement("div");
  row.className = `timeline-row ${extraClass}`.trim();
  row.style.setProperty("--days", String(summary?.days || settings.days));
  return row;
}

function createCell(className, text = "") {
  const cell = document.createElement("div");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function createTaskLabel(name, detail, className) {
  const cell = createCell(className);
  cell.append(createElement("strong", "", name), createElement("span", "", detail));
  return cell;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function setSyncStatus(state, label) {
  syncBadge.dataset.state = state;
  syncBadge.textContent = label;
}

function applyOpacity() {
  document.documentElement.style.setProperty("--panel-opacity", String(settings.opacity / 100));
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cached || cached.serverUrl !== settings.serverUrl || !cached.summary) return null;
    return cached;
  } catch {
    return null;
  }
}

function normalizeServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatDate(date) { return String(date).replaceAll("-", "."); }
function weekday(date) { return new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", { weekday: "short" }); }
function isWeekend(date) { const day = new Date(`${date}T00:00:00`).getDay(); return day === 0 || day === 6; }
function formatTaskRange(task) {
  if (task.fixed) return "평일 상시";
  if (!task.start || !task.end) return "";
  return `${task.start.slice(5).replace("-", ".")} — ${task.end.slice(5).replace("-", ".")}`;
}
function conditionTypeLabel(type) {
  return ({ actual: "기록", estimated: "추정", forecast: "예측", missing: "미기록" })[type] || "";
}
