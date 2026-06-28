const storageKey = "schedule-wave-board";
const schemaVersion = 1;
const companyWorkId = "company-work"; // 컨디션 밑에 고정되는 상시 "회사 업무" 행의 id.
const dayMs = 24 * 60 * 60 * 1000;
const visibleDayCount = 14;

// 레이아웃 상수
const timelineLabelWidth = 220; // 타임라인 좌측 목표 라벨(거터) 폭. 캔버스 그래프도 동일 기준 사용.
const timelineFillMinWidth = 760; // 이 폭 이상이면 날짜 칸이 패널을 꽉 채우고 캔버스와 x축이 1:1로 맞음.
const narrowWidth = 560; // 좁은 화면 분기(여백/선 굵기 등).
const dragPxPerDay = 34; // 날짜 드래그 시 하루로 환산하는 픽셀 감도.
const wheelPxPerDay = 50; // 트랙패드 두 손가락 가로 스와이프 시 하루로 환산하는 픽셀 감도.

// 에너지 스케일 / 과부하 기준
const energyMax = 120; // 에너지 원값 범위 0-energyMax.
const overloadLoad = 70; // 업무량(0-100) 이 값 이상이면서
const overloadEnergyScore = 50; // 에너지 점수(0-100) 이 값 이하이면 과부하.

// 목표별 마일스톤 마커에 쓰는 task 색 팔레트.
const taskPalette = ["#1f8a56", "#3467c2", "#c67b16", "#c94141", "#167782", "#7a4ab0"];

// 데스크톱에서는 타임라인 날짜 칸이 패널을 꽉 채우고(가로 스크롤 없음) 캔버스와 x축이 1:1로 맞습니다.
// 좁은 화면에서는 고정 칸 폭으로 스크롤합니다.
function isTimelineFill() {
  return window.innerWidth >= timelineFillMinWidth;
}

// 연도 무관 양력 고정 공휴일(폴백 기준선). 연도별 정확한 목록은 holidays/<연도>.json 에서 로드합니다.
const fixedKoreanHolidays = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

// 연도별 공휴일 캐시. holidays/<연도>.js 를 <script>로 주입해 채웁니다.
// <script> 방식은 file://(더블클릭 실행)에서도 차단되지 않습니다. 파일이 없으면 fixedKoreanHolidays 로 폴백합니다.
const holidayCache = new Map();
const holidayRequested = new Set();

// holidays/<연도>.js 가 전역에서 호출하는 등록 함수.
function registerHolidays(year, map) {
  if (!map || typeof map !== "object") return;
  holidayCache.set(Number(year), map);
  render();
}

// 렌더 1회 동안 재사용하는 파생값 캐시. render()/saveState() 에서 무효화합니다.
let energySamplesCache = null;

function invalidateDerivedCaches() {
  energySamplesCache = null;
}

function ensureHolidayData(dates) {
  const years = new Set(dates.map((date) => Number(date.slice(0, 4))));
  years.forEach((year) => {
    if (holidayRequested.has(year)) return;
    holidayRequested.add(year);
    const script = document.createElement("script");
    script.src = `holidays/${year}.js`;
    script.async = true;
    // 해당 연도 파일이 없으면(미작성) 조용히 무시하고 고정 공휴일로 폴백.
    script.onerror = () => script.remove();
    document.head.append(script);
  });
}

const sampleState = {
  schemaVersion,
  taskOrderMode: "due",
  energy: {
    "2026-06-24": 80,
    "2026-06-25": 60,
    "2026-06-26": 40,
    "2026-06-28": 40,
    "2026-07-01": 60,
    "2026-07-03": 60,
    "2026-07-05": 80,
  },
  tasks: [
    {
      id: "company-work",
      name: "회사 업무",
      fixed: true,
      start: "0001-01-01",
      end: "9999-12-31",
      weight: null,
      entries: {
        "2026-06-25": { milestone: false, done: false, delta: 10, trouble: "", extra: "", note: "주간 정기 회의" },
        "2026-07-02": { milestone: true, done: false, delta: 15, trouble: "", extra: "", note: "분기 보고" },
      },
    },
    {
      id: "task-1",
      name: "고객사 제안서",
      start: "2026-06-24",
      end: "2026-07-05",
      entries: {
        "2026-06-24": { milestone: true, done: true, delta: 15, trouble: "", extra: "", note: "요구사항과 제안 범위 정리" },
        "2026-06-26": { milestone: false, done: false, delta: -10, trouble: "견적 기준 재확인 필요", extra: "레퍼런스 자료 추가 요청", note: "일부 일정 조정" },
        "2026-06-30": { milestone: true, done: false, delta: 20, trouble: "", extra: "", note: "초안 공유 목표" },
      },
    },
    {
      id: "task-2",
      name: "운영 이슈 대응",
      start: "2026-06-25",
      end: "2026-07-08",
      entries: {
        "2026-06-25": { milestone: true, done: true, delta: 10, trouble: "", extra: "", note: "장애 원인 분류" },
        "2026-06-28": { milestone: false, done: false, delta: -5, trouble: "재현 조건 불안정", extra: "로그 수집 자동화 추가", note: "" },
        "2026-07-03": { milestone: true, done: false, delta: 25, trouble: "", extra: "", note: "재발 방지안 정리" },
      },
    },
    {
      id: "task-3",
      name: "채용 인터뷰",
      start: "2026-06-26",
      end: "2026-07-06",
      entries: {
        "2026-06-26": { milestone: false, done: true, delta: 10, trouble: "", extra: "", note: "후보자 2명 서류 검토" },
        "2026-07-01": { milestone: true, done: false, delta: 15, trouble: "", extra: "과제 리뷰 시간 확보", note: "1차 인터뷰 예정" },
        "2026-07-04": { milestone: false, done: false, delta: -5, trouble: "일정 재조율 필요", extra: "", note: "" },
      },
    },
  ],
};

let state = loadState();
let activeCell = null;
let activeTaskId = null;
let activeEnergyDate = null;
let draggedTaskId = null;
let draggedEntryMove = null;
let graphMode = "total";
let windowStart = 0;
let selectedEnergyValue = 80;
let graphHoverData = [];
let activeGraphPoint = null;
let activeHoverDate = null;
let companyProjectsCollapsed = false;

// 클라우드 동기화(구글 로그인) 상태
let cloudUser = null;
let cloudClientId = null;
let cloudSaveTimer = null;

const taskForm = document.querySelector("#taskForm");
const taskName = document.querySelector("#taskName");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const isCompanyProject = document.querySelector("#isCompanyProject");
const recurringForm = document.querySelector("#recurringForm");
const recurringName = document.querySelector("#recurringName");
const recurringWeekdays = document.querySelector("#recurringWeekdays");
const recurringMonths = document.querySelector("#recurringMonths");
const timeline = document.querySelector("#timeline");
const rangeLabel = document.querySelector("#rangeLabel");
const todayLabel = document.querySelector("#todayLabel");
const authArea = document.querySelector("#authArea");
const dateRangePill = document.querySelector("#dateRangePill");
const canvas = document.querySelector("#progressCanvas");
const graphTooltip = document.querySelector("#graphTooltip");
const conditionLegend = document.querySelector("#conditionLegend");
const milestoneLegend = document.querySelector("#milestoneLegend");
const resetDemo = document.querySelector("#resetDemo");
const totalGraphMode = document.querySelector("#totalGraphMode");
const taskGraphMode = document.querySelector("#taskGraphMode");
const prevWindow = document.querySelector("#prevWindow");
const nextWindow = document.querySelector("#nextWindow");
const dialog = document.querySelector("#entryDialog");
const entryForm = document.querySelector("#entryForm");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogMeta = document.querySelector("#dialogMeta");
const isMilestone = document.querySelector("#isMilestone");
const progressDelta = document.querySelector("#progressDelta");
const deltaValue = document.querySelector("#deltaValue");
const troubleText = document.querySelector("#troubleText");
const extraText = document.querySelector("#extraText");
const noteText = document.querySelector("#noteText");
const deleteEntry = document.querySelector("#deleteEntry");
const saveEntry = document.querySelector("#saveEntry");
const taskDialog = document.querySelector("#taskDialog");
const taskEditForm = document.querySelector("#taskEditForm");
const editTaskName = document.querySelector("#editTaskName");
const editTaskNameField = document.querySelector("#editTaskNameField");
const editStartDate = document.querySelector("#editStartDate");
const editEndDate = document.querySelector("#editEndDate");
const editTaskDateGrid = document.querySelector("#editTaskDateGrid");
const editTaskWorkloadGrid = document.querySelector("#editTaskWorkloadGrid");
const editTaskHours = document.querySelector("#editTaskHours");
const workloadPreview = document.querySelector("#workloadPreview");
const companyProjectWorkloadNote = document.querySelector("#companyProjectWorkloadNote");
const taskDialogTitle = document.querySelector("#taskDialogTitle");
const deleteTask = document.querySelector("#deleteTask");
const completeTask = document.querySelector("#completeTask");
const saveTask = document.querySelector("#saveTask");
const openCompleted = document.querySelector("#openCompleted");
const completedCount = document.querySelector("#completedCount");
const completedDialog = document.querySelector("#completedDialog");
const completedDialogBody = document.querySelector("#completedDialogBody");
const closeCompleted = document.querySelector("#closeCompleted");
const energyDialog = document.querySelector("#energyDialog");
const energyEditForm = document.querySelector("#energyEditForm");
const energyDialogMeta = document.querySelector("#energyDialogMeta");
const energyLevel = document.querySelector("#energyLevel");
const energyValue = document.querySelector("#energyValue");
const energyMarks = document.querySelectorAll(".energy-mark");
const deleteEnergy = document.querySelector("#deleteEnergy");
const saveEnergy = document.querySelector("#saveEnergy");

initDates();
initProgressSlider();
render();
initCloud();
installDateDrag(canvas);
installDateDrag(timeline);
installWheelNav(canvas);
installWheelNav(timeline);
canvas.addEventListener("mousemove", showGraphTooltip);
canvas.addEventListener("mouseleave", hideGraphTooltip);

window.addEventListener("resize", () => {
  render();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const start = startDate.value;
  const end = endDate.value;

  if (new Date(start) > new Date(end)) {
    endDate.setCustomValidity("종료일은 시작일 이후여야 합니다.");
    endDate.reportValidity();
    return;
  }

  endDate.setCustomValidity("");
  state.tasks.push({
    id: crypto.randomUUID(),
    name: taskName.value.trim(),
    start,
    end,
    weight: null,
    hours: null,
    companyProject: isCompanyProject.checked,
    entries: {},
  });

  if (isCompanyProject.checked) companyProjectsCollapsed = false;
  sortTasksByDueDateIfAutomatic();
  taskName.value = "";
  isCompanyProject.checked = false;
  saveState();
  render();
});

recurringForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const months = Math.max(1, Math.floor(Number(recurringMonths.value) || 1));
  const today = new Date();
  const start = toInputDate(today);
  const end = toInputDate(addMonths(today, months));
  const weekdays = getSelectedRecurringWeekdays();
  if (weekdays.length === 0) {
    recurringWeekdays.querySelector("input")?.setCustomValidity("반복 요일을 하나 이상 선택하세요.");
    recurringWeekdays.querySelector("input")?.reportValidity();
    return;
  }
  recurringWeekdays.querySelectorAll("input").forEach((input) => input.setCustomValidity(""));

  state.tasks.push({
    id: crypto.randomUUID(),
    name: recurringName.value.trim(),
    start,
    end,
    weight: null,
    hours: null,
    recurring: {
      frequency: "weekly",
      weekdays,
    },
    entries: {},
  });

  sortTasksByDueDateIfAutomatic();
  recurringName.value = "";
  recurringWeekdays.querySelectorAll("input").forEach((input) => {
    input.checked = false;
    input.setCustomValidity("");
  });
  saveState();
  render();
});

energyLevel.addEventListener("input", () => {
  setSelectedEnergy(magnetizeEnergy(positionToEnergy(Number(energyLevel.value))));
});

energyMarks.forEach((mark) => {
  mark.addEventListener("click", () => {
    setSelectedEnergy(Number(mark.dataset.energy));
  });
});

entryForm.addEventListener("submit", (event) => {
  if (event.submitter !== saveEntry) return;
  event.preventDefault();
  if (!activeCell) return;

  const task = state.tasks.find((item) => item.id === activeCell.taskId);
  if (!task) return;

  const entry = {
    milestone: isMilestone.checked,
    delta: getProgressDeltaValue(),
    trouble: troubleText.value.trim(),
    extra: extraText.value.trim(),
    note: noteText.value.trim(),
  };

  if (isEmptyEntry(entry)) {
    delete task.entries[activeCell.date];
  } else {
    expandTaskRange(task, activeCell.date);
    task.entries[activeCell.date] = entry;
  }

  dialog.close();
  activeCell = null;
  saveState();
  render();
});

deleteEntry.addEventListener("click", () => {
  if (!activeCell) return;
  const task = state.tasks.find((item) => item.id === activeCell.taskId);
  if (task) delete task.entries[activeCell.date];
  dialog.close();
  activeCell = null;
  saveState();
  render();
});

resetDemo.addEventListener("click", () => {
  state = structuredClone(sampleState);
  sortTasksByDueDateIfAutomatic();
  saveState();
  render();
});

totalGraphMode.addEventListener("click", () => {
  graphMode = "total";
  render();
});

taskGraphMode.addEventListener("click", () => {
  graphMode = "tasks";
  render();
});

prevWindow.addEventListener("click", () => {
  moveWindow(-visibleDayCount);
});

nextWindow.addEventListener("click", () => {
  moveWindow(visibleDayCount);
});

editTaskHours.addEventListener("input", updateWorkloadEditor);

taskEditForm.addEventListener("submit", (event) => {
  if (event.submitter !== saveTask) return;
  event.preventDefault();

  const task = state.tasks.find((item) => item.id === activeTaskId);
  if (!task) return;

  if (!task.fixed) {
    if (new Date(editStartDate.value) > new Date(editEndDate.value)) {
      editEndDate.setCustomValidity("종료일은 시작일 이후여야 합니다.");
      editEndDate.reportValidity();
      return;
    }
    editEndDate.setCustomValidity("");
    task.name = editTaskName.value.trim();
    task.start = editStartDate.value;
    task.end = editEndDate.value;
  }
  if (isCompanyProjectTaskType(task)) {
    task.weight = null;
    task.hours = null;
  } else {
    task.weight = null;
    task.hours = editTaskHours.value === "" ? null : Math.max(0, Number(editTaskHours.value));
  }
  sortTasksByDueDateIfAutomatic();
  activeTaskId = null;
  taskDialog.close();
  saveState();
  render();
});

deleteTask.addEventListener("click", () => {
  if (!activeTaskId) return;
  const target = state.tasks.find((task) => task.id === activeTaskId);
  if (target?.fixed) return; // 고정 행은 삭제 불가.
  state.tasks = state.tasks.filter((task) => task.id !== activeTaskId);
  activeTaskId = null;
  taskDialog.close();
  saveState();
  render();
});

completeTask.addEventListener("click", () => {
  if (!activeTaskId) return;
  const target = state.tasks.find((task) => task.id === activeTaskId);
  if (!target || target.fixed) return; // 고정 행은 완료 처리 불가.
  target.completed = true; // 타임라인에서 빠지고 완료한 목표 보관함으로 이동(그래프엔 유지).
  activeTaskId = null;
  taskDialog.close();
  saveState();
  render();
});

openCompleted.addEventListener("click", () => completedDialog.showModal());

const jumpDate = document.querySelector("#jumpDate");
const jumpToday = document.querySelector("#jumpToday");
if (jumpDate) jumpDate.addEventListener("change", () => jumpToDate(jumpDate.value));
if (jumpToday) {
  jumpToday.addEventListener("click", () => {
    const today = toInputDate(new Date());
    if (jumpDate) jumpDate.value = today;
    jumpToDate(today);
  });
}
closeCompleted.addEventListener("click", () => completedDialog.close());

energyEditForm.addEventListener("submit", (event) => {
  if (event.submitter !== saveEnergy) return;
  event.preventDefault();
  if (!activeEnergyDate) return;

  state.energy[activeEnergyDate] = selectedEnergyValue;
  activeEnergyDate = null;
  energyDialog.close();
  saveState();
  render();
});

deleteEnergy.addEventListener("click", () => {
  if (!activeEnergyDate) return;
  delete state.energy[activeEnergyDate];
  activeEnergyDate = null;
  energyDialog.close();
  saveState();
  render();
});

// 닫기/취소 버튼(value="cancel")을 submit이 아닌 일반 버튼으로 만들어,
// 입력 중 Enter가 (DOM상 첫 submit인) 닫기 버튼이 아니라 저장 버튼을 누르게 한다.
document.querySelectorAll('dialog button[value="cancel"]').forEach((btn) => {
  btn.type = "button";
  btn.addEventListener("click", () => btn.closest("dialog")?.close());
});

function initDates() {
  const today = new Date();
  const start = toInputDate(today);
  const end = toInputDate(addDays(today, 13));
  startDate.value = start;
  endDate.value = end;
  todayLabel.textContent = `오늘 · ${formatDate(start)}`;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(sampleState);

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.tasks)) return structuredClone(sampleState);
    if (isLegacySample(parsed)) return structuredClone(sampleState);
    return migrateState(parsed);
  } catch {
    return structuredClone(sampleState);
  }
}

// 저장 데이터를 현재 스키마로 비파괴적으로 끌어올립니다. 새 버전이 생기면 단계별 변환을 여기에 추가합니다.
function migrateState(parsed) {
  if (!parsed.energy || typeof parsed.energy !== "object") parsed.energy = {};
  if (!parsed.taskOrderMode) parsed.taskOrderMode = "due";
  ensureCompanyWorkTask(parsed);
  if (parsed.taskOrderMode !== "manual") sortTasksByDueDate(parsed.tasks);
  parsed.schemaVersion = schemaVersion;
  return parsed;
}

function saveState() {
  invalidateDerivedCaches();
  state.schemaVersion = schemaVersion;
  localStorage.setItem(storageKey, JSON.stringify(state));
  scheduleCloudSave();
}

// ===== 클라우드 동기화 (구글 로그인 + Railway 서버) =====
function scheduleCloudSave() {
  if (!cloudUser) return;
  clearTimeout(cloudSaveTimer);
  setSyncStatus("saving");
  cloudSaveTimer = setTimeout(pushBoardToServer, 800);
}

async function pushBoardToServer() {
  if (!cloudUser) return;
  setSyncStatus("saving");
  try {
    const res = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: state }),
    });
    setSyncStatus(res.ok ? "saved" : "error");
  } catch {
    /* 네트워크 오류 시에도 로컬에는 이미 저장돼 있음 */
    setSyncStatus("error");
  }
}

// 로그인 옆 동기화 상태 마커 갱신
const SYNC_LABELS = { idle: "동기화", saving: "동기화 중…", saved: "동기화됨", error: "동기화 실패" };
let syncResetTimer = null;
function setSyncStatus(status) {
  if (!authArea) return;
  const el = authArea.querySelector(".sync-status");
  if (!el) return;
  clearTimeout(syncResetTimer);
  el.dataset.state = status;
  el.querySelector(".sync-text").textContent = SYNC_LABELS[status] || "";
  // 저장 완료/실패 표시는 잠깐 보여준 뒤 평소 '동기화'로 복귀
  if (status === "saved" || status === "error") {
    syncResetTimer = setTimeout(() => setSyncStatus("idle"), 2000);
  }
}

function applyServerBoard(board) {
  state = migrateState(board);
  localStorage.setItem(storageKey, JSON.stringify(state));
  render();
}

async function fetchServerBoard() {
  try {
    const res = await fetch("/api/board");
    if (!res.ok) return null;
    const data = await res.json();
    return data.board || null;
  } catch {
    return null;
  }
}

// 로그인 직후: 서버 보드가 있으면 사용(서버 우선), 없으면 현재 로컬을 서버로 올림(병합).
async function syncAfterLogin() {
  const serverBoard = await fetchServerBoard();
  if (serverBoard) {
    applyServerBoard(serverBoard);
  } else {
    await pushBoardToServer();
  }
}

async function onGoogleCredential(response) {
  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    if (!res.ok) throw new Error("auth failed");
    const data = await res.json();
    cloudUser = data.user;
    await syncAfterLogin();
    renderAuthArea();
  } catch {
    window.alert("구글 로그인에 실패했습니다.");
  }
}

async function signOutCloud() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  cloudUser = null;
  renderAuthArea();
}

function renderAuthArea() {
  if (!authArea) return;
  authArea.innerHTML = "";
  if (!cloudClientId) return; // 동기화 미설정/오프라인 → 로컬 전용

  if (cloudUser) {
    const status = createElement("button", "sync-status");
    status.type = "button";
    status.dataset.state = "idle";
    status.title = "지금 동기화";
    status.append(createElement("i", "sync-dot"), createElement("span", "sync-text", "동기화"));
    status.addEventListener("click", () => {
      clearTimeout(cloudSaveTimer);
      pushBoardToServer();
    });
    const info = createElement("span", "auth-user", cloudUser.email || cloudUser.name || "로그인됨");
    const out = createElement("button", "ghost-button auth-button", "로그아웃");
    out.type = "button";
    out.addEventListener("click", signOutCloud);
    authArea.append(status, info, out);
    return;
  }

  const holder = createElement("div", "auth-gbtn");
  authArea.append(holder);
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.renderButton(holder, {
      type: "standard",
      theme: "outline",
      size: "medium",
      text: "signin_with",
      shape: "pill",
    });
  }
}

async function initCloud() {
  let cfg = null;
  try {
    const res = await fetch("/api/config");
    if (res.ok) cfg = await res.json();
  } catch {
    cfg = null;
  }
  cloudClientId = cfg && cfg.syncEnabled ? cfg.googleClientId : null;
  if (!cloudClientId) {
    renderAuthArea(); // 서버/설정 없음(예: file://) → 로컬 전용으로 동작
    return;
  }

  try {
    const me = await fetch("/api/me").then((r) => r.json());
    cloudUser = me.user || null;
  } catch {
    cloudUser = null;
  }
  if (cloudUser) {
    const serverBoard = await fetchServerBoard();
    if (serverBoard) applyServerBoard(serverBoard);
  }

  // 구글 GIS 스크립트 로드 타이밍 대응
  const setupGsi = () => {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return false;
    window.google.accounts.id.initialize({ client_id: cloudClientId, callback: onGoogleCredential });
    renderAuthArea();
    return true;
  };
  if (!setupGsi()) {
    window.onGoogleLibraryLoad = setupGsi;
  }
}

function render() {
  invalidateDerivedCaches();
  const allDates = getBoardDates();
  syncWindow(allDates);
  const dates = getVisibleDates(allDates);
  ensureHolidayData(dates);
  renderTimeline(dates, allDates);
  updateCompletedUI();
  updateGraphModeButtons();
  updateWindowControls(allDates);
  drawProgress(dates, allDates);
}

function getBoardDates() {
  // 고정 행(상시)은 기간이 보드 범위를 정의하지 않으므로 제외.
  const rangedTasks = state.tasks.filter((task) => !task.fixed);
  const taskStarts = rangedTasks.map((task) => new Date(task.start).getTime());
  const taskEnds = rangedTasks.map((task) => new Date(task.end).getTime());
  const energyDates = Object.keys(state.energy).map((date) => new Date(date).getTime());
  const allTimes = [...taskStarts, ...taskEnds, ...energyDates];

  if (allTimes.length === 0) return [];

  const first = new Date(Math.min(...allTimes));
  const last = new Date(Math.max(...allTimes));
  const dates = [];

  for (let current = first; current <= last; current = addDays(current, 1)) {
    dates.push(toInputDate(current));
  }

  return dates;
}

function getVisibleDates(allDates) {
  return allDates.slice(windowStart, windowStart + visibleDayCount);
}

function syncWindow(allDates) {
  const maxStart = Math.max(0, allDates.length - visibleDayCount);
  windowStart = clamp(windowStart, 0, maxStart);
}

function updateWindowControls(allDates) {
  const maxStart = Math.max(0, allDates.length - visibleDayCount);
  prevWindow.disabled = windowStart === 0;
  nextWindow.disabled = windowStart === maxStart;
}

function moveWindow(amount) {
  const allDates = getBoardDates();
  const maxStart = Math.max(0, allDates.length - visibleDayCount);
  windowStart = clamp(windowStart + amount, 0, maxStart);
  render();
}

// 선택한 날짜가 보이도록 창을 이동(범위 밖이면 가장 가까운 끝으로).
function jumpToDate(dateStr) {
  if (!dateStr) return;
  const allDates = getBoardDates();
  if (allDates.length === 0) return;
  let index = allDates.indexOf(dateStr);
  if (index === -1) index = dateStr < allDates[0] ? 0 : allDates.length - 1;
  const maxStart = Math.max(0, allDates.length - visibleDayCount);
  windowStart = clamp(index - Math.floor(visibleDayCount / 2), 0, maxStart);
  render();
}

function installDateDrag(element) {
  let startX = 0;
  let lastX = 0;
  let dragRemainder = 0;
  let didDrag = false;

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("input, textarea, label, dialog, .task-head")) return;
    if (event.target.closest(".day-cell[draggable='true']")) return;
    startX = event.clientX;
    lastX = event.clientX;
    dragRemainder = 0;
    didDrag = false;
    element.classList.add("dragging");
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!element.hasPointerCapture(event.pointerId)) return;
    dragRemainder += event.clientX - lastX;
    lastX = event.clientX;

    const dayDelta = Math.trunc(-dragRemainder / dragPxPerDay);
    if (dayDelta === 0) return;

    const allDates = getBoardDates();
    const maxStart = Math.max(0, allDates.length - visibleDayCount);
    const nextStart = clamp(windowStart + dayDelta, 0, maxStart);
    if (nextStart === windowStart) return;

    didDrag = true;
    windowStart = nextStart;
    dragRemainder += dayDelta * dragPxPerDay;
    render();
  });

  element.addEventListener("pointerup", (event) => {
    finishDateDrag(element, event);
  });

  element.addEventListener("pointercancel", (event) => {
    finishDateDrag(element, event);
  });

  element.addEventListener(
    "click",
    (event) => {
      if (!didDrag) return;
      event.preventDefault();
      event.stopPropagation();
      didDrag = false;
    },
    true,
  );
}

function finishDateDrag(element, event) {
  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId);
  }
  element.classList.remove("dragging");
}

// 트랙패드 두 손가락 가로 스와이프(wheel deltaX)로 날짜 창 이동. 세로 우세 시 페이지 스크롤로 흘려보냄.
function installWheelNav(element) {
  let wheelRemainder = 0;
  element.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      wheelRemainder += event.deltaX;
      const dayDelta = Math.trunc(wheelRemainder / wheelPxPerDay);
      if (dayDelta === 0) return;
      wheelRemainder -= dayDelta * wheelPxPerDay;

      const allDates = getBoardDates();
      const maxStart = Math.max(0, allDates.length - visibleDayCount);
      const nextStart = clamp(windowStart + dayDelta, 0, maxStart);
      if (nextStart === windowStart) return;
      windowStart = nextStart;
      // 스와이프 중에는 커서가 고정이라 hover가 갱신되지 않으므로 직전 강조 마커/툴팁을 비움.
      activeGraphPoint = null;
      activeHoverDate = null;
      graphTooltip.hidden = true;
      render();
    },
    { passive: false },
  );
}

function renderTimeline(dates, allDates) {
  if (dates.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <strong>아직 등록된 목표가 없어요</strong>
        <p>위 <b>목표 추가</b>로 첫 목표를 만들거나, <b>샘플 초기화</b>로 예시를 둘러보세요.</p>
      </div>
    `;
    rangeLabel.textContent = "목표를 등록하면 날짜별 업무량과 컨디션 흐름이 표시됩니다.";
    dateRangePill.textContent = "";
    return;
  }

  rangeLabel.textContent = `${formatDate(dates[0])} - ${formatDate(dates.at(-1))}`;
  dateRangePill.textContent = `${formatShortDate(dates[0])} - ${formatShortDate(dates.at(-1))}`;
  timeline.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  // 모바일(비-fill)에서는 라벨 칼럼을 좁혀 날짜 칸이 더 보이게 함.
  const labelWidth = isTimelineFill() ? timelineLabelWidth : 140;
  grid.style.setProperty("--label-w", `${labelWidth}px`);
  grid.style.gridTemplateColumns = isTimelineFill()
    ? `${labelWidth}px repeat(${dates.length}, minmax(0, 1fr))`
    : `${labelWidth}px repeat(${dates.length}, 92px)`;
  const visibleTasks = getVisibleTimelineTasks();
  grid.style.gridTemplateRows = `70px repeat(${visibleTasks.length + 1}, 94px)`;
  const companyProjectCount = state.tasks.filter(isCompanyProjectTaskType).length;

  grid.append(createElement("div", "corner", "목표"));
  dates.forEach((date) => {
    const head = createElement("div", "date-head");
    head.dataset.date = date;
    const parsed = new Date(`${date}T00:00:00`);
    const dayInfo = getDayInfo(date);
    const weekday = parsed.toLocaleDateString("ko-KR", { weekday: "short" });
    applyDayClass(head, date);
    // 요일을 일자 옆 "17(월)" 형태로 붙여 공휴일 이름이 한 줄에 안 잘리도록 함.
    head.innerHTML = `<span>${parsed.toLocaleDateString("ko-KR", { month: "short" })}</span><strong>${parsed.getDate()}(${weekday})</strong>${dayInfo.holiday ? `<em>${escapeHtml(dayInfo.holiday)}</em>` : ""}`;
    grid.append(head);
  });

  renderEnergyRow(grid, dates);

  visibleTasks.forEach((task) => {
    const isFixed = Boolean(task.fixed);
    const isCompanyProjectTask = isCompanyProjectTaskType(task);
    const taskProgress = clamp(sumProgress(task, allDates), 0, 100);
    const workloadLabel = formatWeight(getTaskWorkload(task));
    const hoursLabel = formatWeight(getTaskHours(task));
    const rangeText = isFixed ? "상시" : `${formatShortDate(task.start)}-${formatShortDate(task.end)}`;
    const workloadText = isCompanyProjectTask ? "회사 프로젝트" : `${hoursLabel}시간 · 업무량 ${workloadLabel}%`;
    const head = createElement("div", "task-head");
    if (isFixed) head.classList.add("fixed-head");
    if (isCompanyProjectTask) head.classList.add("company-project-head");
    head.draggable = !isFixed;
    head.dataset.taskId = task.id;
    head.innerHTML = `
      <span class="task-title">
        <strong>${escapeHtml(task.name)}</strong>
        <small>${taskProgress}% 진행 · ${workloadText}</small>
        <small class="task-range">${rangeText}</small>
      </span>
    `;
    if (!isFixed) installTaskDrag(head, task.id);
    if (isFixed && companyProjectCount > 0) {
      const toggleButton = createElement("button", "group-toggle-button", companyProjectsCollapsed ? "▸" : "▾");
      toggleButton.type = "button";
      toggleButton.setAttribute("aria-label", `회사 프로젝트 ${companyProjectsCollapsed ? "펼치기" : "접기"}`);
      toggleButton.addEventListener("click", () => {
        companyProjectsCollapsed = !companyProjectsCollapsed;
        render();
      });
      head.prepend(toggleButton);
    }
    const editButton = createElement("button", "edit-task-button", "✎");
    editButton.type = "button";
    editButton.draggable = false;
    editButton.setAttribute("aria-label", `${task.name} 업무 수정`);
    editButton.addEventListener("click", () => openTaskDialog(task.id));
    head.append(editButton);
    grid.append(head);

    dates.forEach((date) => {
      const entry = mergeEntries(getRecurringEntry(task, date), task.entries[date]);
      const hasOwnEntry = Boolean(task.entries[date]);
      const cell = createElement("button", "day-cell");
      cell.dataset.date = date;
      cell.dataset.taskId = task.id;
      applyDayClass(cell, date);
      cell.classList.toggle("company-project-cell", isCompanyProjectTask);
      cell.classList.toggle("milestone-cell", Boolean(entry?.milestone));
      cell.type = "button";
      cell.draggable = hasOwnEntry;
      cell.classList.toggle("movable-entry", hasOwnEntry);
      cell.setAttribute("aria-label", `${task.name} 업무 ${formatDate(date)} 기록 편집`);
      cell.innerHTML = renderCellContent(entry);
      const cellNote = entryNoteText(entry);
      if (cellNote) cell.title = cellNote;
      cell.addEventListener("click", () => openEntryDialog(task.id, date));
      cell.addEventListener("dblclick", () => openEntryDialog(task.id, date, { focusNote: true }));
      installEntryMoveDrag(cell, task.id, date);
      installDateHover(cell, date);
      grid.append(cell);
    });
  });

  timeline.append(grid);
}

function renderEnergyRow(grid, dates) {
  const head = createElement("div", "task-head");
  head.classList.add("energy-head");
  head.innerHTML = `
      <span class="task-title">
        <strong>내 컨디션</strong>
      </span>
  `;
  grid.append(head);

  dates.forEach((date) => {
    const energy = getEnergyForDate(date);
    const cell = createElement("button", "day-cell energy-cell");
    cell.dataset.date = date;
    applyDayClass(cell, date);
    cell.classList.toggle("estimated-energy", energy.type !== "actual" && energy.value !== null);
    cell.type = "button";
    cell.setAttribute("aria-label", `${formatDate(date)} 컨디션 기록 편집`);
    cell.innerHTML = renderEnergyCellContent(energy);
    cell.addEventListener("click", () => openEnergyDialog(date));
    cell.addEventListener("dblclick", () => openEnergyDialog(date));
    installDateHover(cell, date);
    grid.append(cell);
  });
}

function getVisibleTimelineTasks() {
  const companyTask = state.tasks.find((task) => task.fixed);
  const companyProjects = state.tasks.filter((task) => isCompanyProjectTaskType(task) && !task.completed);
  const otherTasks = state.tasks.filter((task) => !task.fixed && !isCompanyProjectTaskType(task) && !task.completed);
  const groupedTasks = [];

  if (companyTask) groupedTasks.push(companyTask);
  if (!companyProjectsCollapsed) groupedTasks.push(...companyProjects);
  groupedTasks.push(...otherTasks);

  return groupedTasks;
}

// 완료한 목표 보관함: 도구 버튼(개수 표시) + 다이얼로그에 목표별 기록 이력 + 되돌리기.
function updateCompletedUI() {
  const completed = state.tasks.filter((task) => task.completed && !task.fixed);
  if (completed.length === 0) {
    openCompleted.hidden = true;
    if (completedDialog.open) completedDialog.close();
    return;
  }
  openCompleted.hidden = false;
  completedCount.textContent = String(completed.length);

  completedDialogBody.innerHTML = "";
  const list = completedDialogBody;
  completed.forEach((task) => {
    const card = createElement("div", "completed-goal");
    const head = createElement("div", "completed-goal-head");
    head.innerHTML = `<strong>${escapeHtml(task.name)}</strong><span>${formatShortDate(task.start)}-${formatShortDate(task.end)}</span>`;
    const restore = createElement("button", "ghost-button restore-button", "되돌리기");
    restore.type = "button";
    restore.addEventListener("click", () => {
      task.completed = false;
      saveState();
      render();
    });
    head.append(restore);
    card.append(head);

    const entries = Object.entries(task.entries)
      .filter(([, entry]) => entry && !isEmptyEntry(entry))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (entries.length === 0) {
      card.append(createElement("p", "completed-empty", "기록된 내용이 없습니다."));
    } else {
      const ul = createElement("ul", "completed-entries");
      entries.forEach(([date, entry]) => {
        const li = document.createElement("li");
        const milestone = entry.milestone ? '<i class="dot milestone"></i>' : "";
        const delta = entry.delta
          ? `<b class="${entry.delta < 0 ? "neg" : "pos"}">${entry.delta > 0 ? "+" : ""}${entry.delta}%</b>`
          : "";
        const text = entry.note || entry.trouble || entry.extra || "";
        li.innerHTML = `${milestone}<span class="ce-date">${formatShortDate(date)}</span>${delta}<span class="ce-text">${escapeHtml(text)}</span>`;
        ul.append(li);
      });
      card.append(ul);
    }
    list.append(card);
  });
}

function installDateHover(element, date) {
  element.addEventListener("mouseenter", () => setActiveHoverDate(date));
  element.addEventListener("mouseleave", () => setActiveHoverDate(null));
}

function installEntryMoveDrag(element, taskId, date) {
  element.addEventListener("dragstart", (event) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task?.entries[date]) {
      event.preventDefault();
      return;
    }

    draggedEntryMove = { taskId, date };
    element.classList.add("entry-dragging");
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-task-entry", JSON.stringify(draggedEntryMove));
  });

  element.addEventListener("dragover", (event) => {
    if (!draggedEntryMove || draggedEntryMove.taskId !== taskId || draggedEntryMove.date === date) return;
    event.preventDefault();
    // Ctrl 누른 채 드래그하면 복사, 아니면 이동.
    event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
    element.classList.toggle("entry-copy-target", event.ctrlKey);
    element.classList.add("entry-drop-target");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("entry-drop-target");
  });

  element.addEventListener("drop", (event) => {
    if (!draggedEntryMove || draggedEntryMove.taskId !== taskId) return;
    event.preventDefault();
    element.classList.remove("entry-drop-target", "entry-copy-target");
    if (event.ctrlKey) {
      copyTaskEntry(draggedEntryMove.taskId, draggedEntryMove.date, date);
    } else {
      moveTaskEntry(draggedEntryMove.taskId, draggedEntryMove.date, date);
    }
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("entry-copy-target");
  });

  element.addEventListener("dragend", () => {
    draggedEntryMove = null;
    document.querySelectorAll(".entry-dragging, .entry-drop-target, .entry-copy-target").forEach((item) => {
      item.classList.remove("entry-dragging", "entry-drop-target", "entry-copy-target");
    });
  });
}

function setActiveHoverDate(date) {
  activeHoverDate = date;
  document.querySelectorAll(".date-highlight").forEach((element) => {
    element.classList.remove("date-highlight");
  });
  if (date) {
    document.querySelectorAll(`[data-date="${date}"]`).forEach((element) => {
      element.classList.add("date-highlight");
    });
  }

  const match = graphHoverData.find((item) => item.date === date);
  activeGraphPoint = match || null;
  drawProgress(getVisibleDates(getBoardDates()), getBoardDates());
}

function installTaskDrag(element, taskId) {
  element.addEventListener("dragstart", (event) => {
    if (event.target.closest(".edit-task-button")) {
      event.preventDefault();
      return;
    }
    draggedTaskId = taskId;
    element.classList.add("row-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  });

  element.addEventListener("dragover", (event) => {
    if (!draggedTaskId || draggedTaskId === taskId) return;
    event.preventDefault();
    element.classList.add("row-drop-target");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("row-drop-target");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    element.classList.remove("row-drop-target");
    if (!sourceId || sourceId === taskId) return;
    reorderTask(sourceId, taskId);
  });

  element.addEventListener("dragend", () => {
    draggedTaskId = null;
    document.querySelectorAll(".row-dragging, .row-drop-target").forEach((item) => {
      item.classList.remove("row-dragging", "row-drop-target");
    });
  });
}

function reorderTask(sourceId, targetId) {
  const sourceIndex = state.tasks.findIndex((task) => task.id === sourceId);
  const targetIndex = state.tasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  if (state.tasks[sourceIndex].fixed || state.tasks[targetIndex].fixed) return; // 고정 행은 순서변경 불가.

  const [task] = state.tasks.splice(sourceIndex, 1);
  state.tasks.splice(targetIndex, 0, task);
  state.taskOrderMode = "manual";
  saveState();
  render();
}

function moveTaskEntry(taskId, sourceDate, targetDate) {
  if (sourceDate === targetDate) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task?.entries[sourceDate]) return;
  if (task.entries[targetDate]) return;

  task.entries[targetDate] = task.entries[sourceDate];
  delete task.entries[sourceDate];
  expandTaskRange(task, targetDate);
  saveState();
  render();
}

// Ctrl+드래그 복사: 원본은 두고 대상 날짜에 같은 기록을 복제.
function copyTaskEntry(taskId, sourceDate, targetDate) {
  if (sourceDate === targetDate) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task?.entries[sourceDate]) return;
  if (task.entries[targetDate]) return;

  task.entries[targetDate] = { ...task.entries[sourceDate] };
  expandTaskRange(task, targetDate);
  saveState();
  render();
}

function sortTasksByDueDateIfAutomatic() {
  if (state.taskOrderMode === "manual") return;
  state.taskOrderMode = "due";
  sortTasksByDueDate(state.tasks);
}

function sortTasksByDueDate(tasks) {
  tasks.sort((a, b) => {
    // 고정 행(회사 업무)은 항상 맨 앞.
    if (Boolean(a.fixed) !== Boolean(b.fixed)) return a.fixed ? -1 : 1;
    if (Boolean(a.companyProject) !== Boolean(b.companyProject)) return a.companyProject ? -1 : 1;
    const dueDiff = new Date(a.end).getTime() - new Date(b.end).getTime();
    if (dueDiff !== 0) return dueDiff;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

// 평일 = 주말(토/일)도 공휴일도 아닌 날.
function isWorkday(date) {
  const info = getDayInfo(date);
  return !info.isSaturday && !info.isSunday && !info.holiday;
}

// 고정 행(회사 업무)은 평일이면 기록이 없어도 기본 활성(출근), 주말·공휴일은 기록이 있을 때만 활성.
// 일반 목표는 자기 기간 안에서만 활성.
function isTaskActiveOn(task, date) {
  if (task.fixed) return isWorkday(date) || Boolean(task.entries[date]);
  return date >= task.start && date <= task.end;
}

function hasTaskWorkOn(task, date) {
  if (task.fixed) return isTaskActiveOn(task, date);
  return Boolean(mergeEntries(getRecurringEntry(task, date), task.entries[date]));
}

// 저장 데이터에 회사 업무 고정 행이 없으면 만들어 맨 앞에 둡니다.
function ensureCompanyWorkTask(stateObj) {
  if (!Array.isArray(stateObj.tasks)) stateObj.tasks = [];
  let task = stateObj.tasks.find((item) => item.fixed || item.id === companyWorkId);
  if (!task) {
    task = {
      id: companyWorkId,
      name: "회사 업무",
      fixed: true,
      start: "0001-01-01",
      end: "9999-12-31",
      weight: null,
      entries: {},
    };
  } else {
    task.fixed = true;
  }
  stateObj.tasks = [task, ...stateObj.tasks.filter((item) => item !== task)];
}

function getEnergyForDate(date) {
  if (state.energy[date] !== undefined) {
    return { value: clamp(Number(state.energy[date]), 0, energyMax), type: "actual" };
  }

  const samples = getEnergySamples();
  if (samples.length === 0) return { value: null, type: "missing" };

  const targetTime = new Date(`${date}T00:00:00`).getTime();
  const last = samples.at(-1);
  if (targetTime > last.time) {
    return { value: forecastEnergy(targetTime, samples), type: "forecast" };
  }

  return { value: estimateEnergy(targetTime, samples), type: "estimated" };
}

function getEnergySamples() {
  if (energySamplesCache) return energySamplesCache;
  energySamplesCache = Object.entries(state.energy)
    .map(([date, value]) => ({
      date,
      time: new Date(`${date}T00:00:00`).getTime(),
      value: clamp(Number(value), 0, energyMax),
    }))
    .filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.time))
    .sort((a, b) => a.time - b.time);
  return energySamplesCache;
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
  const baseline = 90; // 기록 이후 컨디션이 수렴하는 기준값.
  const decay = Math.exp(-daysAhead / 10);
  const trend = recentSlope * daysAhead * Math.exp(-daysAhead / 5);
  const wave = Math.sin((daysAhead / 3) * Math.PI) * 6 * Math.exp(-daysAhead / 12);
  const value = baseline + (last.value - baseline) * decay + trend + wave;

  return Math.round(clamp(value, 0, energyMax));
}

function getEnergyTypeLabel(type) {
  if (type === "estimated") return " (추정)";
  if (type === "forecast") return " (예측)";
  return "";
}

function renderEnergyCellContent(energy) {
  const numeric = energy.value === null ? null : clamp(Number(energy.value), 0, energyMax);
  const estimatedClass = energy.type === "actual" ? "" : " estimated";
  const badge = numeric === null ? "" : `<span class="energy-badge">${numeric}</span>`;
  const marker = numeric === null ? "" : `<i class="dot energy${estimatedClass}"></i>`;
  return `<div class="cell-content"><div class="cell-markers">${marker}</div>${badge}</div>`;
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

function renderCellContent(entry) {
  if (!entry) return '<div class="cell-content"><div class="cell-markers"></div></div>';

  const markers = [
    entry.recurring ? '<i class="dot recurring"></i>' : "",
    entry.milestone ? '<i class="dot milestone"></i>' : "",
    entry.trouble ? '<i class="dot trouble"></i>' : "",
    entry.extra ? '<i class="dot extra"></i>' : "",
  ].join("");
  const delta = entry.delta
    ? `<span class="delta-badge ${entry.delta < 0 ? "negative" : "positive"}">${entry.delta > 0 ? "+" : ""}${entry.delta}%</span>`
    : "";

  // 노트 텍스트는 셀에 인라인으로 표시하고(잘리면 말줄임) 전체는 hover 툴팁(title)으로도 확인.
  const noteSource = entryNoteText(entry);
  const note = noteSource ? `<span class="cell-note">${escapeHtml(noteSource)}</span>` : "";
  return `<div class="cell-content"><div class="cell-markers">${markers}</div>${delta}${note}</div>`;
}

function entryNoteText(entry) {
  if (!entry) return "";
  return entry.note || entry.trouble || entry.extra || "";
}

function getRecurringEntry(task, date) {
  if (!task.recurring) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (task.recurring.frequency !== "weekly") return null;
  const weekdays = Array.isArray(task.recurring.weekdays) ? task.recurring.weekdays : [task.recurring.weekday];
  if (!weekdays.map(Number).includes(parsed.getDay())) return null;
  return { recurring: true, note: "정기 일정" };
}

function getSelectedRecurringWeekdays() {
  return Array.from(recurringWeekdays.querySelectorAll("input:checked")).map((input) => Number(input.value));
}

function initProgressSlider() {
  noUiSlider.create(progressDelta, {
    start: 0,
    step: 5,
    range: {
      min: -40,
      max: 40,
    },
    keyboardSupport: true,
  });
  progressDelta.insertAdjacentHTML("beforeend", '<span id="deltaFill" class="delta-fill"></span>');
  progressDelta.noUiSlider.on("update", () => updateProgressDeltaUi());
}

function getProgressDeltaValue() {
  return Math.round(Number(progressDelta.noUiSlider.get()));
}

function setProgressDeltaValue(value) {
  progressDelta.noUiSlider.set(Number(value || 0));
}

function updateProgressDeltaUi() {
  const value = getProgressDeltaValue();
  const position = ((value + 40) / 80) * 100;
  const start = value < 0 ? position : 50;
  const width = Math.abs(position - 50);
  const color = value > 0 ? "#3467c2" : value < 0 ? "#c94141" : "#66736d";
  progressDelta.classList.toggle("positive", value > 0);
  progressDelta.classList.toggle("negative", value < 0);
  progressDelta.classList.toggle("neutral", value === 0);
  const deltaFill = progressDelta.querySelector("#deltaFill");
  deltaFill.style.left = `${start}%`;
  deltaFill.style.width = `${width}%`;
  deltaFill.style.background = color;
  deltaValue.classList.toggle("positive", value > 0);
  deltaValue.classList.toggle("negative", value < 0);
  deltaValue.classList.toggle("neutral", value === 0);
  deltaValue.textContent = value === 0 ? "●" : `${value > 0 ? "+" : ""}${value}%`;
}

function openEntryDialog(taskId, date, options = {}) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  activeCell = { taskId, date };
  const entry = task.entries[date] || {};

  dialogTitle.textContent = task.name;
  dialogMeta.textContent = formatDate(date);
  isMilestone.checked = Boolean(entry.milestone);
  setProgressDeltaValue(entry.delta || 0);
  troubleText.value = entry.trouble || "";
  extraText.value = entry.extra || "";
  noteText.value = entry.note || "";
  dialog.showModal();
  if (options.focusNote) {
    requestAnimationFrame(() => noteText.focus());
  }
}

function openTaskDialog(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  activeTaskId = taskId;
  editTaskName.value = task.name;
  editStartDate.value = task.start;
  editEndDate.value = task.end;
  editTaskHours.value = task.hours ?? weightToHours(task.weight) ?? "";
  editEndDate.setCustomValidity("");
  // 고정 행(회사 업무)은 이름·기간·삭제 잠금, 소요 시간만 수정.
  const isFixed = Boolean(task.fixed);
  taskDialogTitle.textContent = isFixed ? "회사 업무 설정" : "목표 수정";
  editTaskNameField.hidden = isFixed;
  editTaskDateGrid.hidden = isFixed;
  editTaskWorkloadGrid.hidden = isCompanyProjectTaskType(task);
  companyProjectWorkloadNote.hidden = !isCompanyProjectTaskType(task);
  deleteTask.hidden = isFixed;
  completeTask.hidden = isFixed; // 고정 행(회사 업무)은 완료 처리 불가.
  updateWorkloadEditor();
  taskDialog.showModal();
}

function openEnergyDialog(date) {
  activeEnergyDate = date;
  const value = clamp(Number(state.energy[date] ?? 80), 0, energyMax);
  energyDialogMeta.textContent = formatDate(date);
  setSelectedEnergy(value);
  energyDialog.showModal();
}

function updateWorkloadEditor() {
  const hours = Math.max(0, Number(editTaskHours.value || 0));
  const workload = hoursToWorkload(hours);
  workloadPreview.classList.toggle("warning", workload > 100);
  workloadPreview.textContent = `적용 업무량 ${formatWeight(workload)}% · ${formatWeight(hours)}시간`;
}

function setSelectedEnergy(value) {
  selectedEnergyValue = clamp(Number(value), 0, energyMax);
  energyLevel.value = String(energyToPosition(selectedEnergyValue));
  energyValue.textContent = String(selectedEnergyValue);
  const nearest = nearestEnergyMarker(selectedEnergyValue);
  energyMarks.forEach((mark) => {
    const isActive = Number(mark.dataset.energy) === nearest;
    mark.classList.toggle("active", isActive);
    if (isActive) {
      mark.classList.remove("pulse");
      void mark.offsetWidth;
      mark.classList.add("pulse");
    } else {
      mark.classList.remove("pulse");
    }
  });
}

function nearestEnergyMarker(value) {
  const numeric = Number(value);
  const markers = [40, 60, 80, 100];
  return markers.reduce((closest, marker) => {
    return Math.abs(marker - numeric) < Math.abs(closest - numeric) ? marker : closest;
  }, 80);
}

function magnetizeEnergy(value) {
  const numeric = clamp(Number(value), 0, energyMax);
  const nearest = nearestEnergyMarker(numeric);
  return Math.abs(nearest - numeric) <= 6 ? nearest : numeric;
}

// 슬라이더 위치(0-100)와 에너지 원값(0-energyMax) 사이의 비선형 매핑 기준점.
// 이모지 기준점(40/60/80/100)이 화면상 균등 간격에 오도록 구간을 환산합니다.
const energyScalePoints = [
  { position: 0, value: 0 },
  { position: 20, value: 40 },
  { position: 40, value: 60 },
  { position: 60, value: 80 },
  { position: 80, value: 100 },
  { position: 100, value: energyMax },
];

function positionToEnergy(position) {
  return Math.round(interpolatePoints(energyScalePoints, position, "position", "value"));
}

function energyToPosition(value) {
  return Math.round(interpolatePoints(energyScalePoints, value, "value", "position"));
}

function interpolatePoints(points, input, inputKey, outputKey) {
  const clampedInput = clamp(Number(input), points[0][inputKey], points.at(-1)[inputKey]);

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (clampedInput <= next[inputKey]) {
      const ratio = (clampedInput - previous[inputKey]) / (next[inputKey] - previous[inputKey]);
      return previous[outputKey] + ratio * (next[outputKey] - previous[outputKey]);
    }
  }

  return points.at(-1)[outputKey];
}

function updateGraphModeButtons() {
  totalGraphMode.classList.toggle("active", graphMode === "total");
  taskGraphMode.classList.toggle("active", graphMode === "tasks");
  // 컨디션 선은 전체 흐름에만, 마일스톤은 목표별 흐름에만 표시 → 범례도 모드별로 토글.
  conditionLegend.hidden = graphMode === "tasks";
  milestoneLegend.hidden = graphMode === "total";
}

function drawProgress(dates, allDates = getBoardDates()) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(220, rect.height);
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  context.fillStyle = "#fbfcfb";
  context.fillRect(0, 0, width, height);
  graphHoverData = [];

  drawWeekendBands(context, dates, width, height);
  // 이중축 동기화: 전체 흐름은 업무량 0~energyMax(120)로 컨디션 축과 격자를 맞춤.
  const loadAxisMax = graphMode === "total" ? energyMax : 100;
  drawGrid(context, width, height, loadAxisMax);
  drawTodayMarker(context, dates, width, height);

  if (dates.length === 0) return;

  if (graphMode === "tasks") {
    // 목표별 흐름은 마일스톤 날짜의 누적 진척률만 표시합니다.
    setMilestoneHoverData(dates, allDates, width, height);
    drawMilestoneLinks(context, dates, allDates, width, height);
    drawMilestones(context, dates, allDates, width, height);
    drawActiveGraphPoint(context, width, height, 100);
    return;
  }

  drawHistoryPreview(context, dates, allDates, width, height, loadAxisMax);
  drawTotalLine(context, dates, allDates, width, height, loadAxisMax);
  drawEnergyLine(context, dates, width, height, energyMax);
  drawActiveGraphPoint(context, width, height, loadAxisMax);
}

// 목표별 흐름에서 각 task의 마일스톤(entries[date].milestone)을 누적진척률 지점에 다이아몬드로 표시.
function drawMilestones(context, dates, allDates, width, height) {
  state.tasks.forEach((task, taskIndex) => {
    const color = taskPalette[taskIndex % taskPalette.length];
    drawTaskLegend(context, task.name, color, taskIndex, width);
    dates.forEach((date, index) => {
      if (!task.entries[date]?.milestone) return;
      const value = clamp(sumProgress(task, allDates, date), 0, 100);
      const point = makePoints([value], dates.length, width, height, 100, index)[0];
      drawDiamond(context, point.x, point.y, width < narrowWidth ? 5 : 6, color);
    });
  });
}

function drawMilestoneLinks(context, dates, allDates, width, height) {
  state.tasks.forEach((task, taskIndex) => {
    const color = taskPalette[taskIndex % taskPalette.length];
    const points = dates
      .map((date, index) => {
        if (!task.entries[date]?.milestone) return null;
        const value = clamp(sumProgress(task, allDates, date), 0, 100);
        return makePoints([value], dates.length, width, height, 100, index)[0];
      })
      .filter(Boolean);

    if (points.length < 2) return;
    drawMilestoneStepLine(context, points, color, width < 560 ? 2 : 3);
  });
}

function drawMilestoneStepLine(context, points, color, lineWidth) {
  if (points.length < 2) return;

  context.save();
  context.globalAlpha = 0.72;
  context.setLineDash([8, 6]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    const distance = point.x - prev.x;
    const rampWidth = Math.min(Math.abs(distance) * 0.34, 54);
    const rampStartX = point.x - Math.sign(distance || 1) * rampWidth;

    context.lineTo(rampStartX, prev.y);
    context.bezierCurveTo(
      rampStartX + rampWidth * 0.45,
      prev.y,
      point.x - rampWidth * 0.45,
      point.y,
      point.x,
      point.y,
    );
  }

  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

function setMilestoneHoverData(dates, allDates, width, height) {
  graphHoverData = dates.map((date, index) => ({
    x: makePoints([0], dates.length, width, height, 100, index)[0].x,
    date,
    total: totalProgressForDate(date),
    energy: getEnergyForDate(date),
    tasks: state.tasks
      .filter((task) => task.entries[date]?.milestone)
      .map((task) => ({
        name: task.name,
        progress: clamp(sumProgress(task, allDates, date), 0, 100),
      })),
  }));
}

function drawDiamond(context, x, y, radius, color) {
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = "#ffffff";
  context.stroke();
}

function drawTotalLine(context, dates, allDates, width, height, maxAxis) {
  const values = dates.map((date) => totalProgressForDate(date));
  // 축 천장(120%) 초과 값은 그래프에선 천장에 맞춰 그리고, 툴팁엔 실제값을 보존.
  const clamped = values.map((value) => Math.min(value, maxAxis));
  const points = makePoints(clamped, dates.length, width, height, maxAxis);

  drawWavePath(context, points, "#c94141", width < 560 ? 3 : 5, true, width, height);
  graphHoverData = points.map((point, index) => ({
    x: point.x,
    date: dates[index],
    total: values[index],
    energy: getEnergyForDate(dates[index]),
    tasks: [],
  }));
}

function drawHistoryPreview(context, dates, allDates, width, height, loadAxisMax = 100) {
  const firstIndex = allDates.indexOf(dates[0]);
  const { labelWidth, columnWidth } = getColumnLayout(width, dates.length);
  if (firstIndex <= 0 || labelWidth <= 0 || columnWidth <= 0) return;

  const padding = getPadding(width);
  const maxPreviewDays = Math.max(1, Math.floor((labelWidth - padding) / columnWidth + 0.5));
  const previewCount = Math.min(firstIndex, maxPreviewDays, 3);
  const previewDates = allDates.slice(firstIndex - previewCount, firstIndex);
  const previewAndCurrentDates = [...previewDates, dates[0]];
  const offset = -previewCount;

  const totalValues = previewAndCurrentDates.map((date) =>
    Math.min(totalProgressForDate(date), loadAxisMax),
  );
  drawHistoryPath(
    context,
    makePoints(totalValues, dates.length, width, height, loadAxisMax, offset),
    "#c94141",
    width < 560 ? 2 : 3,
  );

  const energyValues = previewAndCurrentDates.map((date) => {
    const energy = getEnergyForDate(date);
    if (energy.value === null) return null;
    return clamp(Number(energy.value), 0, energyMax);
  });
  splitSegments(energyValues).forEach((segment) => {
    drawHistoryPath(
      context,
      makePoints(segment.values, dates.length, width, height, energyMax, offset + segment.offset),
      "#3467c2",
      width < 560 ? 2 : 3,
    );
  });
}

function drawHistoryPath(context, points, color, lineWidth) {
  if (points.length < 2) return;

  context.save();
  context.globalAlpha = 0.48;
  context.setLineDash([5, 6]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    const midX = (prev.x + point.x) / 2;
    context.bezierCurveTo(midX, prev.y, midX, point.y, point.x, point.y);
  }
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

function drawTaskLines(context, dates, allDates, width, height) {
  state.tasks.forEach((task, taskIndex) => {
    const values = dates.map((date) => {
      if (!isTaskActiveOn(task, date)) return null;
      return clamp(sumProgress(task, allDates, date), 0, 100);
    });
    const segments = splitSegments(values);
    const color = taskPalette[taskIndex % taskPalette.length];

    segments.forEach((segment) => {
      const points = makePoints(segment.values, dates.length, width, height, 100, segment.offset);
      drawWavePath(context, points, color, width < 560 ? 2 : 3, false, width, height);
    });

    drawTaskLegend(context, task.name, color, taskIndex, width);
  });

  graphHoverData = dates.map((date, index) => ({
    x: makePoints([0], dates.length, width, height, 100, index)[0].x,
    date,
    total: totalProgressForDate(date),
    energy: getEnergyForDate(date),
    tasks: state.tasks
      .filter((task) => hasTaskWorkOn(task, date))
      .map((task) => ({
        name: task.name,
        progress: clamp(sumProgress(task, allDates, date), 0, 100),
      })),
  }));
}

function drawEnergyLine(context, dates, width, height, maxAxis) {
  const energyPoints = dates
    .map((date, index) => ({ index, energy: getEnergyForDate(date) }))
    .filter((item) => item.energy.value !== null)
    .map((item) => {
      const value = clamp(Number(item.energy.value), 0, energyMax);
      const scaledValue = graphMode === "total" ? scaleEnergyToAxis(value, maxAxis) : value;
      return {
        ...makePoints([scaledValue], dates.length, width, height, maxAxis, item.index)[0],
        type: item.energy.type,
      };
    });

  if (energyPoints.length === 0) return;

  const forecastStart = energyPoints.findIndex((point) => point.type === "forecast");
  const solidPoints = forecastStart < 0 ? energyPoints : energyPoints.slice(0, Math.max(1, forecastStart + 1));
  const forecastPoints = forecastStart < 0 ? [] : energyPoints.slice(Math.max(0, forecastStart - 1));

  drawWavePath(context, solidPoints, "#3467c2", width < 560 ? 2 : 4, false, width, height);
  if (forecastPoints.length > 1) {
    drawWavePath(context, forecastPoints, "#3467c2", width < 560 ? 2 : 4, false, width, height, [7, 7]);
  }

  energyPoints.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, point.type === "actual" ? (width < 560 ? 5 : 7) : 4, 0, Math.PI * 2);
    context.fillStyle = point.type === "actual" ? "#3467c2" : "rgba(52, 103, 194, 0.3)";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = point.type === "actual" ? "#ffffff" : "rgba(52, 103, 194, 0.7)";
    context.stroke();
  });

}

// 주말(토/일)과 공휴일 날짜 칼럼 배경을 옅은 붉은색으로 표시.
function drawWeekendBands(context, dates, width, height) {
  const { columnWidth } = getColumnLayout(width, dates.length);
  dates.forEach((date, index) => {
    const info = getDayInfo(date);
    if (!info.isSaturday && !info.isSunday && !info.holiday) return;
    const x = makePoints([0], dates.length, width, height, 100, index)[0].x;
    context.fillStyle = "rgba(201, 65, 65, 0.06)";
    context.fillRect(x - columnWidth / 2, 0, columnWidth, height);
  });
}

function drawTodayMarker(context, dates, width, height) {
  const today = toInputDate(new Date());
  const index = dates.indexOf(today);
  if (index < 0) return;

  // 목표별 흐름은 상단에 task 범례가 있어 "오늘" 라벨을 그 아래로 내림.
  const labelY = graphMode === "tasks" ? 48 : 20;
  const lineTop = graphMode === "tasks" ? 56 : 28;
  const point = makePoints([0], dates.length, width, height, 100, index)[0];
  context.beginPath();
  context.moveTo(point.x, lineTop);
  context.lineTo(point.x, height - 30);
  context.setLineDash([5, 5]);
  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(22, 32, 27, 0.35)";
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#16201b";
  context.font = `800 ${width < 560 ? 11 : 12}px Segoe UI`;
  context.textAlign = "center";
  context.fillText("오늘", point.x, labelY);
}

function showGraphTooltip(event) {
  if (graphHoverData.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const nearest = graphHoverData.reduce((closest, item) => {
    return Math.abs(item.x - x) < Math.abs(closest.x - x) ? item : closest;
  }, graphHoverData[0]);
  setActiveHoverDate(nearest.date);
  const energyScore = nearest.energy.value === null ? null : energyToScore(nearest.energy.value);
  const energy =
    nearest.energy.value === null
      ? "기록 없음"
      : `${nearest.energy.value}${getEnergyTypeLabel(nearest.energy.type)}`;
  const status = getLoadStatus(nearest.total, energyScore);
  const taskLines = nearest.tasks.slice(0, 6).map((task) => {
    return `<span>${escapeHtml(task.name)}: ${Math.round(task.progress)}%</span>`;
  });

  graphTooltip.innerHTML = `
    <strong>${formatDate(nearest.date)}</strong>
    <span class="status ${status.className}">${status.label}</span>
    <span>업무량: ${Math.round(nearest.total)}%</span>
    <span>컨디션: ${energy}</span>
    ${taskLines.join("")}
  `;
  graphTooltip.hidden = false;
  graphTooltip.style.left = `${event.clientX + 12}px`;
  graphTooltip.style.top = `${event.clientY + 12}px`;
}

function hideGraphTooltip() {
  setActiveHoverDate(null);
  graphTooltip.hidden = true;
}

function getLoadStatus(load, energyScore) {
  if (energyScore === null) return { label: "컨디션 미기록", className: "warn" };
  if (load >= overloadLoad && energyScore <= overloadEnergyScore) return { label: "과부하", className: "overload" };
  if (load > energyScore + 15) return { label: "주의", className: "warn" };
  return { label: "여유", className: "" };
}

function drawActiveGraphPoint(context, width, height, maxAxis) {
  if (!activeGraphPoint) return;

  // 목표별 흐름: 마일스톤 날짜의 누적진척률 지점만 task 색으로 강조.
  if (graphMode === "tasks") {
    const date = activeGraphPoint.date;
    const allDates = getBoardDates();
    state.tasks.forEach((task, taskIndex) => {
      if (!task.entries[date]?.milestone) return;
      const value = clamp(sumProgress(task, allDates, date), 0, 100);
      const y = valueToGraphY(value, width, height, 100);
      drawHighlightDot(context, activeGraphPoint.x, y, taskPalette[taskIndex % taskPalette.length]);
    });
    return;
  }

  const totalY = valueToGraphY(Math.min(activeGraphPoint.total, maxAxis), width, height, maxAxis);
  drawHighlightDot(context, activeGraphPoint.x, totalY, "#c94141");

  if (activeGraphPoint.energy.value !== null) {
    const energyY = valueToGraphY(Number(activeGraphPoint.energy.value), width, height, energyMax);
    drawHighlightDot(context, activeGraphPoint.x, energyY, "#3467c2");
  }
}

function valueToGraphY(value, width, height, maxAxis) {
  const padding = getPadding(width);
  const usableHeight = height - padding * 2;
  return padding + usableHeight - (usableHeight * value) / maxAxis;
}

function drawHighlightDot(context, x, y, color) {
  context.beginPath();
  context.arc(x, y, 11, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.86)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = color;
  context.stroke();

  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function getPadding(width) {
  return width < narrowWidth ? 34 : 46;
}

// 캔버스와 타임라인이 공유하는 x축 기하: 왼쪽 라벨 거터 + 날짜 수만큼 균등 분할한 칼럼.
function getColumnLayout(width, totalDays) {
  const labelWidth = isTimelineFill() ? timelineLabelWidth : 0;
  return {
    labelWidth,
    columnWidth: (width - labelWidth) / Math.max(1, totalDays),
  };
}

// 에너지 원값(0-energyMax)을 0-100 점수로 환산.
function energyToScore(value) {
  return Math.round((Number(value) / energyMax) * 100);
}

// 에너지 원값을 그래프 y축(0-maxAxis) 스케일로 환산.
function scaleEnergyToAxis(value, maxAxis) {
  return (Number(value) / energyMax) * maxAxis;
}

function makePoints(values, totalDays, width, height, maxAxis, offset = 0) {
  const padding = getPadding(width);
  // 각 점은 해당 날짜 칼럼의 중심에 위치해 타임라인 날짜 셀 중심과 x좌표가 맞습니다.
  const { labelWidth, columnWidth } = getColumnLayout(width, totalDays);
  const usableHeight = height - padding * 2;
  return values.map((value, index) => ({
    x: labelWidth + columnWidth * (index + offset + 0.5),
    y: padding + usableHeight - (usableHeight * value) / maxAxis,
    value,
  }));
}

function drawWavePath(context, points, color, lineWidth, fill, width, height, dash = [], showPoints = true) {
  if (points.length === 0) return;
  const padding = getPadding(width);
  context.setLineDash(dash);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    const midX = (prev.x + point.x) / 2;
    context.bezierCurveTo(midX, prev.y, midX, point.y, point.x, point.y);
  }

  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
  context.setLineDash([]);

  if (fill) {
  const gradient = context.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, colorToRgba(color, 0.46));
    gradient.addColorStop(1, colorToRgba(color, 0));
  context.lineTo(points.at(-1).x, height - padding);
  context.lineTo(points[0].x, height - padding);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  }

  if (!showPoints) return;

  points.forEach((point, index) => {
    context.beginPath();
    context.arc(point.x, point.y, width < 560 ? 3 : 5, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = color;
    context.stroke();
  });
}

function colorToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawGrid(context, width, height, loadAxisMax = 100) {
  const padding = getPadding(width);
  const usableHeight = height - padding * 2;
  const showCondition = graphMode === "total";
  context.strokeStyle = "#d9e0da";
  context.lineWidth = 1;
  context.font = `700 ${width < 560 ? 11 : 14}px Segoe UI`;

  // 균등 간격 가로선: 좌측은 업무량/진척 %, 우측은 컨디션 0~energyMax.
  [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
    const y = padding + (1 - fraction) * usableHeight;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();

    context.fillStyle = "#66736d";
    context.textAlign = "left";
    context.fillText(`${Math.round(fraction * loadAxisMax)}%`, 8, y + 4);

    if (showCondition) {
      context.fillStyle = "#3467c2";
      context.textAlign = "right";
      context.fillText(`${Math.round(fraction * energyMax)}`, width - 8, y + 4);
    }
  });

  // 축 제목 (상단 숫자와 충분히 떨어지도록 위로)
  const titleY = padding - 20;
  context.font = `800 ${width < 560 ? 10 : 11}px Segoe UI`;
  context.fillStyle = graphMode === "total" ? "#c94141" : "#66736d";
  context.textAlign = "left";
  context.fillText(graphMode === "total" ? "업무량" : "진척", 8, titleY);
  if (showCondition) {
    context.fillStyle = "#3467c2";
    context.textAlign = "right";
    context.fillText("컨디션", width - 8, titleY);
  }
}

// 업무량(날짜) = 그 날짜에 실제 기록/정기 일정이 있는 task들의 소요 시간 합산값.
function totalProgressForDate(date) {
  return state.tasks.reduce((sum, task) => {
    if (isCompanyProjectTaskType(task)) return sum;
    if (!hasTaskWorkOn(task, date)) return sum;
    return sum + getTaskWorkload(task);
  }, 0);
}

function getTaskWorkload(task) {
  if (!task || isCompanyProjectTaskType(task)) return 0;
  const hours = getTaskHours(task);
  return hoursToWorkload(hours || 0);
}

function getTaskHours(task) {
  if (!task || isCompanyProjectTaskType(task)) return 0;
  if (Number.isFinite(Number(task.hours)) && task.hours !== null && task.hours !== "") return Number(task.hours);
  return weightToHours(task.weight) || 0;
}

function hoursToWorkload(hours) {
  return (Math.max(0, Number(hours) || 0) / 12) * 100;
}

function weightToHours(weight) {
  if (!Number.isFinite(Number(weight)) || weight === null || weight === "") return null;
  return (Math.max(0, Number(weight)) / 100) * 12;
}

function isCompanyProjectTaskType(task) {
  return Boolean(task.companyProject);
}

function formatWeight(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function splitSegments(values) {
  const segments = [];
  let active = null;

  values.forEach((value, index) => {
    if (value === null) {
      if (active) {
        segments.push(active);
        active = null;
      }
      return;
    }

    if (!active) active = { offset: index, values: [] };
    active.values.push(value);
  });

  if (active) segments.push(active);
  return segments;
}

function drawTaskLegend(context, name, color, index, width) {
  if (width < narrowWidth || index > 5) return;

  const legendX0 = 92;
  const legendGap = 190;
  const x = legendX0 + index * legendGap;
  const y = 24;
  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.fillStyle = "#66736d";
  context.font = "700 13px Segoe UI";
  context.textAlign = "left";
  context.fillText(name.slice(0, 14), x + 10, y + 5);
}

function sumProgress(task, dates, throughDate = dates.at(-1)) {
  return dates
    .filter((date) => date >= task.start && date <= throughDate)
    .reduce((sum, date) => sum + Number(task.entries[date]?.delta || 0), 0);
}

function isEmptyEntry(entry) {
  return !entry.milestone && entry.delta === 0 && !entry.trouble && !entry.extra && !entry.note;
}

function expandTaskRange(task, date) {
  if (task.fixed) return; // 고정 행은 상시라 기간 확장 불필요.
  if (date < task.start) task.start = date;
  if (date > task.end) task.end = date;
}

function isLegacySample(parsed) {
  const names = parsed.tasks.map((task) => task.name).sort().join(",");
  return names === "MVP 기능 구현,콘텐츠 정리";
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toInputDate(date) {
  const parsed = new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatShortDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function getHolidayName(date) {
  const yearMap = holidayCache.get(Number(date.slice(0, 4)));
  if (yearMap && yearMap[date]) return yearMap[date];
  return fixedKoreanHolidays[date.slice(5)] || "";
}

function getDayInfo(date) {
  const parsed = new Date(`${date}T00:00:00`);
  const day = parsed.getDay();
  return {
    isSaturday: day === 6,
    isSunday: day === 0,
    holiday: getHolidayName(date),
  };
}

function applyDayClass(element, date) {
  const dayInfo = getDayInfo(date);
  element.classList.toggle("saturday", dayInfo.isSaturday);
  element.classList.toggle("sunday", dayInfo.isSunday);
  element.classList.toggle("holiday", Boolean(dayInfo.holiday));
  if (dayInfo.holiday) element.title = dayInfo.holiday;
}

function createElement(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[character];
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
