import {
  addDays,
  escapeHtml,
  formatDuration,
  isoDate,
  monthMatrix,
  pad2,
  parseIso,
  startOfMonth
} from './utils.js';
import {
  analyticsDay as ensureAnalyticsDay,
  recordActiveTime as recordAnalyticsTime,
  renderAnalyticsPage as renderAnalyticsPageView
} from './pages/analytics.js';
import { renderCalendarPage as renderCalendarPageView } from './pages/calendar.js';
import { renderDateInspector as renderDateInspectorView } from './pages/dateInspector.js';
import {
  completeTodayOpenTasks as completeTodayOpenTasksAction,
  renderTodayInspector as renderTodayInspectorView,
  renderTodayPage as renderTodayPageView
} from './pages/today.js';
import {
  addTask as createTask,
  aggregateTaskStats as summarizeTaskStats,
  dayTaskStats as getDayTaskStats,
  formatTaskSummaryLine as formatTaskLine,
  normalizeOrders as reorderTasks,
  removeTask as deleteTask,
  tasksForDate as selectTasksForDate,
  tasksForVisibleMonth as selectTasksForVisibleMonth
} from './tasks.js';
import { seedDemoData } from './devSeed.js';

const pageRegistry = [
  { id: 'calendar', label: 'CALENDAR', render: renderCalendarPage },
  { id: 'today', label: 'TODAY', render: renderTodayPage },
  { id: 'analytics', label: 'ANALYTICS', render: renderAnalyticsPage }
];

const state = {
  store: { tasks: [], signals: [], analytics: { days: {} }, reports: [], settings: {} },
  current: startOfMonth(new Date()),
  selected: isoDate(new Date()),
  page: 'calendar',
  inspectorMode: 'date',
  selectedTaskId: null,
  displayBounds: null,
  showDesktopSize: false,
  toastTimer: null,
  clockTimer: null,
  analyticsTimer: null,
  syncTimer: null,
  syncInFlight: false,
  lastActiveTick: null
};

const els = {};

window.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  state.store = await window.daymark.loadStore();
  state.displayBounds = await window.daymark.displayBounds?.().catch(() => null);
  applySurfaceOpacity(Number(state.store.settings.windowOpacity ?? 0.86));
  bindActions();
  startClock();
  startAnalyticsTracking();
  startSyncTracking();
  renderAll();
});

function bindElements() {
  for (const id of [
    'pageTabs', 'systemClock', 'statusStrip', 'pageMount', 'inspector',
    'settingsButton', 'toast'
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindActions() {
  els.settingsButton.addEventListener('click', () => {
    state.inspectorMode = state.inspectorMode === 'settings' ? 'date' : 'settings';
    renderInspector();
  });
  window.daymark.onTrayToggleDesktop?.(() => {
    setDesktopMode(!state.store.settings.desktopMode);
  });
  window.daymark.onTrayOpenSettings?.(async () => {
    // Desktop mode is click-through, so drop back to a window before showing settings.
    if (state.store.settings.desktopMode) await setDesktopMode(false);
    state.inspectorMode = 'settings';
    renderInspector();
  });
  els.pageMount.addEventListener('click', handleTaskContainerClick);
  els.inspector.addEventListener('click', handleTaskContainerClick);
  window.addEventListener('keydown', handleGlobalKeydown);
}

function startAnalyticsTracking() {
  state.lastActiveTick = Date.now();
  state.analyticsTimer = setInterval(recordActiveTime, 30000);
  window.addEventListener('beforeunload', () => recordActiveTime());
}

async function recordActiveTime() {
  await recordAnalyticsTime({ state, persist, renderAll });
}
function startSyncTracking() {
  clearInterval(state.syncTimer);
  state.syncTimer = setInterval(() => syncNow({ quiet: true }), 180000);
  setTimeout(() => syncNow({ quiet: true }), 1200);
}

function syncConfigured() {
  return Boolean(String(state.store.settings.syncUrl || '').trim() && String(state.store.settings.syncKey || '').trim().length >= 16);
}

function renderAll() {
  document.body.classList.toggle('analytics-mode', state.page === 'analytics');
  document.body.classList.toggle('desktop-mode', Boolean(state.store.settings.desktopMode));
  renderTabs();
  renderStatusStrip();
  renderPage();
  renderInspector();
  applyTaskSelection();
}

function renderTabs() {
  els.pageTabs.innerHTML = '';
  for (const page of pageRegistry) {
    const button = document.createElement('button');
    button.className = `page-tab ${page.id === state.page ? 'active' : ''}`;
    button.type = 'button';
    button.textContent = page.label;
    button.addEventListener('click', () => {
      state.page = page.id;
      state.inspectorMode = page.id === 'calendar' ? 'date' : page.id;
      renderAll();
    });
    els.pageTabs.appendChild(button);
  }
}

function renderStatusStrip() {
  const monthTasks = tasksForVisibleMonth();
  const done = monthTasks.filter((task) => task.completed).length;
  const open = monthTasks.length - done;
  const selectedTasks = tasksForDate(state.selected);
  const carry = state.store.tasks.filter((task) => task.taskDate < isoDate(new Date()) && !task.completed).length;
  const rows = [
    ['PAGE', activePage().label],
    ['MONTH', `${state.current.getFullYear()}-${pad2(state.current.getMonth() + 1)}`],
    ['SELECTED', state.selected],
    ['TASKS', String(monthTasks.length)],
    ['DONE', String(done)],
    ['OPEN', String(open)],
    ['SELECTED OPEN', String(selectedTasks.filter((task) => !task.completed).length)],
    ['CARRY', String(carry)],
    ['MODE', state.store.settings.desktopMode ? 'DESKTOP' : 'WINDOW']
  ];

  els.statusStrip.innerHTML = '';
  for (const [label, value] of rows) {
    const item = document.createElement('div');
    item.className = 'status-item';
    item.innerHTML = `<span>${label}</span><strong>${escapeHtml(value)}</strong>`;
    els.statusStrip.appendChild(item);
  }
}

function renderPage() {
  const page = activePage();
  els.pageMount.innerHTML = '';
  page.render();
}

function renderCalendarPage() {
  renderCalendarPageView({
    mount: els.pageMount,
    current: state.current,
    selected: state.selected,
    tasksForDate,
    goToday,
    carryIncomplete,
    selectDate,
    moveTaskToDate
  });
}
function renderTodayPage() {
  renderTodayPageView({
    mount: els.pageMount,
    tasksForDate,
    renderDescriptionInput,
    addTask,
    removeTask,
    commitExisting,
    persist,
    renderAll
  });
}

async function completeTodayOpenTasks() {
  await completeTodayOpenTasksAction({ tasksForDate, persist, renderAll, showToast });
}
function renderAnalyticsPage() {
  renderAnalyticsPageView({ mount: els.pageMount, analyticsDay, store: state.store });
}

function analyticsDay(dayId) {
  return ensureAnalyticsDay(state.store, dayId);
}

function dayTaskStats(dayId) {
  return getDayTaskStats(state.store, dayId);
}

function aggregateTaskStats(days) {
  return summarizeTaskStats(state.store, days);
}

function recentDateIds(count) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => isoDate(addDays(today, -(count - 1 - index))));
}

function renderPlaceholderPage(title, description) {
  const shell = document.createElement('section');
  shell.className = 'placeholder';
  shell.innerHTML = `
    <div class="eyebrow">RESERVED MODULE</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <div class="placeholder-lines">
      <span>adapter: pending</span>
      <span>storage: shared store</span>
      <span>render: page registry</span>
    </div>
  `;
  els.pageMount.appendChild(shell);
}

function renderInspector() {
  if (state.inspectorMode === 'settings') {
    renderSettingsInspector();
    return;
  }
  if (state.inspectorMode === 'today') {
    renderTodayInspector();
    return;
  }
  if (state.inspectorMode === 'analytics') {
    els.inspector.innerHTML = '';
    return;
  }
  if (state.inspectorMode === 'roadmap') {
    renderRoadmapInspector();
    return;
  }
  renderDateInspector();
}

function renderTodayInspector() {
  renderTodayInspectorView({ inspector: els.inspector, tasksForDate, completeTodayOpenTasks });
}
function renderDateInspector() {
  renderDateInspectorView({
    inspector: els.inspector,
    selected: state.selected,
    tasksForDate,
    carryIncomplete,
    completeSelectedOpenTasks,
    copySelectedSummary,
    addTask,
    removeTask,
    commitExisting,
    persist,
    renderAll,
    focusInspectorDraft
  });
}
function handleDescriptionTab(event, textarea) {
  if (event.key !== 'Tab' && event.key !== 'Enter') return false;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', start);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  const bulletMatch = line.match(/^(\s*)(?:\u2022|-)\s(.*)$/);

  if (event.key === 'Enter') {
    if (!bulletMatch) return false;
    event.preventDefault();

    const indent = bulletMatch[1];
    const content = bulletMatch[2].trim();
    if (!content) {
      const removeEnd = lineStart + bulletMatch[0].length;
      textarea.value = value.slice(0, lineStart) + value.slice(removeEnd);
      textarea.selectionStart = textarea.selectionEnd = lineStart;
    } else {
      const token = '\n' + indent + '\u2022 ';
      textarea.value = value.slice(0, start) + token + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  event.preventDefault();

  if (event.shiftKey) {
    if (!bulletMatch) return true;
    const indent = bulletMatch[1];
    const content = bulletMatch[2];
    if (indent.length <= 2) {
      textarea.value = value.slice(0, lineStart) + content + value.slice(lineEnd);
      textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - (line.length - content.length));
    } else {
      textarea.value = value.slice(0, lineStart) + value.slice(lineStart + 2);
      textarea.selectionStart = Math.max(lineStart, start - 2);
      textarea.selectionEnd = Math.max(textarea.selectionStart, end - 2);
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  if (bulletMatch) {
    textarea.value = value.slice(0, lineStart) + '  ' + value.slice(lineStart);
    textarea.selectionStart = textarea.selectionEnd = start + 2;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  const token = line.trim().length ? '  ' : '  \u2022 ';
  textarea.value = value.slice(0, start) + token + value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + token.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
function renderDescriptionInput(task, className) {
  const description = document.createElement('textarea');
  description.className = className;
  description.placeholder = 'description';
  description.value = task.description || '';
  description.spellcheck = false;
  if (description.classList.contains('terminal-description')) {
    requestAnimationFrame(() => applyDescriptionHeight(task, description, { useSavedHeight: true }));
    description.addEventListener('input', () => applyDescriptionHeight(task, description));
    description.addEventListener('mouseup', () => rememberDescriptionHeight(task, description));
  }
  description.addEventListener('keydown', (event) => {
    if (handleDescriptionTab(event, description)) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      description.blur();
    }
  });
  description.addEventListener('blur', () => commitDescription(task, description.value, description));
  return description;
}

function applyDescriptionHeight(task, textarea, options = {}) {
  textarea.style.height = 'auto';
  const hasContent = textarea.value.trim().length > 0;
  if (!hasContent) {
    task.descriptionHeight = 0;
    textarea.style.height = '34px';
    return;
  }

  const savedHeight = options.useSavedHeight ? Number(task.descriptionHeight || 0) : 0;
  textarea.style.height = `${Math.max(textarea.scrollHeight, savedHeight, 34)}px`;
}

function rememberDescriptionHeight(task, textarea) {
  if (!textarea.value.trim()) {
    task.descriptionHeight = 0;
    textarea.style.height = '34px';
    return;
  }
  task.descriptionHeight = Math.max(textarea.offsetHeight, textarea.scrollHeight, 34);
}

async function commitDescription(task, value, textarea = null) {
  const description = value.trim();
  const nextHeight = description && textarea ? Math.max(textarea.offsetHeight, textarea.scrollHeight, 34) : 0;
  const descriptionChanged = (task.description || '') !== description;
  const heightChanged = Number(task.descriptionHeight || 0) !== nextHeight;
  if (!descriptionChanged && !heightChanged) return;

  task.description = description;
  task.descriptionHeight = nextHeight;
  task.updatedAt = new Date().toISOString();
  await persist();
  renderAll();
}
function desktopSizeLabel() {
  const saved = state.store.settings.desktopBounds;
  return saved ? ` (${saved.width}x${saved.height})` : ' (FULL)';
}

function renderSettingsInspector() {
  const opacity = Number(state.store.settings.windowOpacity ?? 0.86);
  const lastSync = state.store.settings.lastSyncedAt || 'never';
  const screenBounds = state.displayBounds;
  const fallback = screenBounds || { x: 0, y: 0, width: 1920, height: 1080 };
  const bounds = state.store.settings.desktopBounds || fallback;
  els.inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">SETTINGS</div>
      <h2>SURFACE</h2>
      <div class="setting-row">
        <label for="opacityRange">BACKGROUND ALPHA <strong id="opacityValue">${Math.round(opacity * 100)}%</strong></label>
        <input id="opacityRange" type="range" min="0" max="1" step="0.01" value="${opacity}">
      </div>
      <p class="muted">?? ???? ?????. ?? ?, ??, ?? ??? ???? ?????.</p>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">SYNC</div>
      <div class="setting-row">
        <label for="syncUrlInput">SYNC URL</label>
        <input id="syncUrlInput" class="settings-input" value="${escapeHtml(state.store.settings.syncUrl || '')}" placeholder="https://your-app.up.railway.app" autocomplete="off">
      </div>
      <div class="setting-row">
        <label for="syncKeyInput">SYNC KEY</label>
        <input id="syncKeyInput" class="settings-input" type="password" value="${escapeHtml(state.store.settings.syncKey || '')}" placeholder="16+ characters" autocomplete="off">
      </div>
      <div class="kv"><span>LAST SYNC</span><strong>${escapeHtml(lastSync)}</strong></div>
      <button class="terminal-button full" type="button" data-command="sync-now">SYNC NOW</button>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">WINDOW</div>
      <button class="terminal-button full" type="button" data-command="desktop">${state.store.settings.desktopMode ? 'DETACH FROM DESKTOP' : 'ATTACH TO DESKTOP'}</button>
      <button class="terminal-button full" type="button" data-command="desktop-size">DESKTOP SIZE${desktopSizeLabel()}</button>
      <div class="desktop-size-panel${state.showDesktopSize ? '' : ' hidden'}" data-desktop-size>
        <div class="size-grid">
          <label>X<input id="deskX" class="settings-input" type="number" value="${bounds.x}"></label>
          <label>Y<input id="deskY" class="settings-input" type="number" value="${bounds.y}"></label>
          <label>W<input id="deskW" class="settings-input" type="number" value="${bounds.width}"></label>
          <label>H<input id="deskH" class="settings-input" type="number" value="${bounds.height}"></label>
        </div>
        <div class="size-presets">
          <button class="terminal-button" type="button" data-preset="full">FULL</button>
          <button class="terminal-button" type="button" data-preset="right">RIGHT 1/2</button>
          <button class="terminal-button" type="button" data-preset="left">LEFT 1/2</button>
        </div>
        <button class="terminal-button full" type="button" data-command="desktop-apply">APPLY SIZE</button>
        <p class="muted">${screenBounds ? `SCREEN ${screenBounds.width} x ${screenBounds.height}` : ''}</p>
      </div>
    </div>
  `;

  const range = els.inspector.querySelector('#opacityRange');
  const value = els.inspector.querySelector('#opacityValue');
  range.addEventListener('input', async () => {
    const next = Number(range.value);
    value.textContent = `${Math.round(next * 100)}%`;
    state.store.settings.windowOpacity = next;
    applySurfaceOpacity(next);
    await persist();
  });

  const syncUrl = els.inspector.querySelector('#syncUrlInput');
  const syncKey = els.inspector.querySelector('#syncKeyInput');
  syncUrl.addEventListener('blur', () => updateSyncSetting('syncUrl', syncUrl.value));
  syncKey.addEventListener('blur', () => updateSyncSetting('syncKey', syncKey.value));
  els.inspector.querySelector('[data-command="sync-now"]').addEventListener('click', syncNow);
  els.inspector.querySelector('[data-command="desktop"]').addEventListener('click', () => setDesktopMode(!state.store.settings.desktopMode));

  els.inspector.querySelector('[data-command="desktop-size"]').addEventListener('click', () => {
    state.showDesktopSize = !state.showDesktopSize;
    renderInspector();
  });

  const sizeFields = {
    x: els.inspector.querySelector('#deskX'),
    y: els.inspector.querySelector('#deskY'),
    width: els.inspector.querySelector('#deskW'),
    height: els.inspector.querySelector('#deskH')
  };

  for (const button of els.inspector.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => {
      const screen = state.displayBounds || fallback;
      const half = Math.round(screen.width / 2);
      const preset = button.dataset.preset;
      const next = preset === 'right'
        ? { x: screen.x + half, y: screen.y, width: screen.width - half, height: screen.height }
        : preset === 'left'
          ? { x: screen.x, y: screen.y, width: half, height: screen.height }
          : { x: screen.x, y: screen.y, width: screen.width, height: screen.height };
      sizeFields.x.value = next.x;
      sizeFields.y.value = next.y;
      sizeFields.width.value = next.width;
      sizeFields.height.value = next.height;
    });
  }

  els.inspector.querySelector('[data-command="desktop-apply"]').addEventListener('click', applyDesktopSize);
}

async function applyDesktopSize() {
  const read = (id) => Math.round(Number(els.inspector.querySelector(id).value));
  const next = { x: read('#deskX'), y: read('#deskY'), width: read('#deskW'), height: read('#deskH') };
  if ([next.x, next.y, next.width, next.height].some((value) => !Number.isFinite(value))) {
    showToast('Size values must be numbers');
    return;
  }

  const screen = state.displayBounds;
  const isFull = screen
    && next.x === screen.x && next.y === screen.y
    && next.width === screen.width && next.height === screen.height;
  // Storing null for a full-screen box keeps it following the display if it changes.
  state.store.settings.desktopBounds = isFull ? null : next;
  await persist();

  // Re-attach so the new box takes effect immediately.
  if (state.store.settings.desktopMode) {
    await setDesktopMode(false, { quiet: true });
    await setDesktopMode(true, { quiet: true });
    showToast('Desktop size applied');
  } else {
    renderInspector();
    showToast('Desktop size saved');
  }
}

async function updateSyncSetting(key, value) {
  state.store.settings[key] = String(value || '').trim();
  await persist();
}

async function syncNow(options = {}) {
  if (state.syncInFlight || !syncConfigured()) {
    if (!options.quiet && !syncConfigured()) showToast('Set SYNC URL and SYNC KEY first');
    return;
  }

  state.syncInFlight = true;
  await persist();
  try {
    const result = await window.daymark.syncStore(state.store);
    state.store = result.store || state.store;
    if (!result.success) state.store.settings.lastSyncError = result.message || 'Sync failed';
    await persist();
    renderAll();
    if (!options.quiet) showToast(result.message || (result.success ? 'Synced' : 'Sync failed'));
  } finally {
    state.syncInFlight = false;
  }
}

function renderRoadmapInspector() {
  els.inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">ARCHITECTURE</div>
      <h2>${escapeHtml(activePage().label)}</h2>
      <p class="muted">? ??? pageRegistry? ???? render ??? ???? ?????.</p>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">NEXT MODULES</div>
      <ol>
        <li>SNS adapters</li>
        <li>OAuth/session storage</li>
        <li>Unified inbox</li>
        <li>Calendar-linked actions</li>
      </ol>
    </div>
  `;
}

const TASK_ROW_SELECTOR = '.inspector-task[data-task-id], .today-task[data-task-id]';

function taskRowEls() {
  return [
    ...els.pageMount.querySelectorAll(TASK_ROW_SELECTOR),
    ...els.inspector.querySelectorAll(TASK_ROW_SELECTOR)
  ];
}

function taskRowById(taskId) {
  return taskRowEls().find((row) => row.dataset.taskId === taskId) || null;
}

function isTaskRowFocused() {
  const active = document.activeElement;
  return Boolean(active && active.closest && active.closest('[data-task-id]'));
}

function applyTaskSelection() {
  const rows = taskRowEls();
  const stillVisible = rows.some((row) => row.dataset.taskId === state.selectedTaskId);
  if (!stillVisible) state.selectedTaskId = null;
  for (const row of rows) {
    row.classList.toggle('task-selected', row.dataset.taskId === state.selectedTaskId);
  }
}

function selectTask(taskId, { focus = false } = {}) {
  state.selectedTaskId = taskId;
  applyTaskSelection();
  if (focus) focusTaskRow(taskId);
}

function focusTaskRow(taskId) {
  const row = taskRowById(taskId);
  if (!row) return;
  row.tabIndex = -1;
  row.focus({ preventScroll: false });
}

function moveTaskSelection(delta) {
  const rows = taskRowEls();
  if (!rows.length) return;
  const index = rows.findIndex((row) => row.dataset.taskId === state.selectedTaskId);
  const nextIndex = index === -1
    ? (delta > 0 ? 0 : rows.length - 1)
    : Math.min(rows.length - 1, Math.max(0, index + delta));
  selectTask(rows[nextIndex].dataset.taskId, { focus: true });
}

function handleTaskContainerClick(event) {
  const row = event.target.closest(TASK_ROW_SELECTOR);
  if (!row) return;
  const interactive = event.target.closest('input, textarea, button');
  selectTask(row.dataset.taskId, { focus: !interactive });
}

async function deleteSelectedTask() {
  const taskId = state.selectedTaskId;
  if (!taskId) return;
  const rows = taskRowEls();
  const index = rows.findIndex((row) => row.dataset.taskId === taskId);
  const nextId = index === -1
    ? null
    : (rows[index + 1]?.dataset.taskId ?? rows[index - 1]?.dataset.taskId ?? null);

  removeTask(taskId);
  state.selectedTaskId = nextId;
  await persist();
  renderAll();
  if (nextId) {
    requestAnimationFrame(() => focusTaskRow(nextId));
  } else if (state.inspectorMode === 'date') {
    focusInspectorDraft();
  }
}

function handleGlobalKeydown(event) {
  if (isEditableTarget(event.target)) return;

  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedTaskId) {
    event.preventDefault();
    deleteSelectedTask();
    return;
  }

  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && isTaskRowFocused()) {
    event.preventDefault();
    moveTaskSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    seedDemoStore();
    return;
  }

  if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < pageRegistry.length) {
      event.preventDefault();
      state.page = pageRegistry[index].id;
      state.inspectorMode = state.page === 'calendar' ? 'date' : state.page;
      renderAll();
      return;
    }
  }

  if (state.page !== 'calendar' || state.inspectorMode !== 'date') return;

  if (event.key === 'Enter') {
    event.preventDefault();
    focusInspectorDraft();
    return;
  }

  const keyMap = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7
  };
  const delta = keyMap[event.key];
  if (!delta) return;

  event.preventDefault();
  selectDate(isoDate(addDays(parseIso(state.selected), delta)));
}

async function seedDemoStore() {
  seedDemoData(state.store);
  state.current = startOfMonth(new Date());
  state.selected = isoDate(new Date());
  await persist();
  renderAll();
  showToast('Demo data loaded');
}
function selectDate(taskDate) {
  state.selected = taskDate;
  if (!visibleDates().includes(taskDate)) {
    state.current = startOfMonth(parseIso(taskDate));
  }
  state.page = 'calendar';
  state.inspectorMode = 'date';
  renderAll();
  requestAnimationFrame(() => {
    document.querySelector(`.day-cell[data-date="${taskDate}"]`)?.focus();
  });
}

async function moveTaskToDate(taskId, taskDate) {
  const task = state.store.tasks.find((item) => item.id === taskId);
  if (!task || task.taskDate === taskDate) return;

  const previousDate = task.taskDate;
  task.taskDate = taskDate;
  task.sortOrder = tasksForDate(taskDate).filter((item) => item.id !== task.id).length;
  task.updatedAt = new Date().toISOString();
  normalizeOrders(previousDate);
  normalizeOrders(taskDate);
  state.selected = taskDate;
  state.current = startOfMonth(parseIso(taskDate));
  state.inspectorMode = 'date';
  await persist();
  renderAll();
  showToast(`??? ${taskDate}? ??????`);
}

async function commitExisting(task, value) {
  const content = value.trim();
  if (!content) {
    removeTask(task.id);
  } else if (task.content !== content) {
    task.content = content;
    task.updatedAt = new Date().toISOString();
  } else {
    return;
  }
  await persist();
  renderAll();
}

function addTask(taskDate, content, originTaskId = null, description = '', descriptionHeight = 0) {
  return createTask(state.store, taskDate, content, originTaskId, description, descriptionHeight);
}

function removeTask(taskId) {
  return deleteTask(state.store, taskId);
}

function normalizeOrders(taskDate) {
  return reorderTasks(state.store, taskDate);
}

function tasksForDate(taskDate) {
  return selectTasksForDate(state.store, taskDate);
}

function tasksForVisibleMonth() {
  return selectTasksForVisibleMonth(state.store, state.current);
}

async function carryIncomplete() {
  const today = isoDate(new Date());
  const before = state.store.tasks.filter((task) => task.taskDate < today);
  const latest = new Map();
  for (const task of before) latest.set(task.originTaskId || task.id, task);
  const existingOrigins = new Set(tasksForDate(today).map((task) => task.originTaskId).filter(Boolean));
  let copied = 0;

  for (const [origin, task] of latest) {
    if (task.completed || existingOrigins.has(origin)) continue;
    addTask(today, task.content, origin, task.description || '', Number(task.descriptionHeight || 0));
    existingOrigins.add(origin);
    copied += 1;
  }

  state.current = startOfMonth(new Date());
  state.selected = today;
  state.page = 'calendar';
  state.inspectorMode = 'date';
  await persist();
  renderAll();
  showToast(copied ? `??? ?? ${copied}?? ??? ??????` : '??? ??? ??? ????');
}

function formatTaskSummaryLine(task) {
  return formatTaskLine(task);
}
async function completeSelectedOpenTasks() {
  const tasks = tasksForDate(state.selected);
  if (!tasks.length) {
    showToast('??? ??? ????');
    return;
  }

  const shouldComplete = tasks.some((task) => !task.completed);
  const targets = shouldComplete ? tasks.filter((task) => !task.completed) : tasks;
  const now = new Date().toISOString();
  for (const task of targets) {
    task.completed = shouldComplete;
    task.updatedAt = now;
  }
  await persist();
  renderAll();
  showToast(shouldComplete ? `?? ${targets.length}?? ?? ??????` : `?? ${targets.length}?? ?? ?????`);
}

async function copySelectedSummary() {
  const tasks = tasksForDate(state.selected);
  const lines = [`${state.selected}`, ...tasks.map((task) => `${task.completed ? '[x]' : '[ ]'} ${task.content}`)];
  await window.daymark.copy(lines.join('\n'));
  showToast('?? ?? ??? ??????');
}

function goToday() {
  selectDate(isoDate(new Date()));
}

function applySurfaceOpacity(opacity) {
  const value = Math.max(0, Math.min(1, Number(opacity)));
  document.documentElement.style.setProperty('--surface-alpha', String(value));
}

async function setDesktopMode(enabled, options = {}) {
  const result = enabled
    ? await window.daymark.enableDesktop(state.store.settings.desktopBounds || null)
    : await window.daymark.disableDesktop();
  if (!result.success) {
    state.store.settings.desktopMode = false;
    await persist();
    if (!options.quiet) showToast(result.message || '???? ?? ??? ??????');
    renderAll();
    return;
  }

  state.store.settings.desktopMode = enabled;
  await persist();
  renderAll();
  if (!options.quiet) showToast(result.message || (enabled ? '???? ??' : '? ??'));
}

function startClock() {
  const tick = () => {
    const now = new Date();
    els.systemClock.textContent = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  };
  tick();
  state.clockTimer = setInterval(tick, 1000);
}

function activePage() {
  return pageRegistry.find((page) => page.id === state.page) || pageRegistry[0];
}

function visibleDates() {
  return monthMatrix(state.current).map(isoDate);
}


function focusInspectorDraft() {
  requestAnimationFrame(() => {
    document.querySelector('[data-inspector-draft="true"]')?.focus();
  });
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable;
}

async function persist() {
  state.store = await window.daymark.saveStore(state.store);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}














































