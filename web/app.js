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
  renderSignalsInspector as renderSignalsInspectorView,
  renderSignalsPage as renderSignalsPageView,
  signalsByStatus as selectSignalsByStatus
} from './pages/signals.js';
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

const pageRegistry = [
  { id: 'calendar', label: 'CALENDAR', render: renderCalendarPage },
  { id: 'today', label: 'TODAY', render: renderTodayPage },
  { id: 'signals', label: 'SIGNALS', render: renderSignalsPage },
  { id: 'analytics', label: 'ANALYTICS', render: renderAnalyticsPage },
  { id: 'log', label: 'LOG', render: () => renderPlaceholderPage('LOG', '?? ??? ?? ??? ??? ??? ? ?????.') }
];

const state = {
  store: { tasks: [], signals: [], analytics: { days: {} }, reports: [], settings: {} },
  current: startOfMonth(new Date()),
  selected: isoDate(new Date()),
  page: 'calendar',
  inspectorMode: 'date',
  toastTimer: null,
  clockTimer: null,
  analyticsTimer: null,
  lastActiveTick: null
};

const els = {};

window.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  state.store = await window.daymark.loadStore();
  applySurfaceOpacity(Number(state.store.settings.windowOpacity ?? 0.86));
  bindActions();
  startClock();
  startAnalyticsTracking();
  renderAll();
});

function bindElements() {
  for (const id of [
    'pageTabs', 'systemClock', 'statusStrip', 'pageMount', 'inspector',
    'desktopButton', 'settingsButton', 'minimizeButton', 'maximizeButton', 'closeButton', 'toast'
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindActions() {
  els.desktopButton.addEventListener('click', () => setDesktopMode(!state.store.settings.desktopMode));
  els.settingsButton.addEventListener('click', () => {
    state.inspectorMode = state.inspectorMode === 'settings' ? 'date' : 'settings';
    renderInspector();
  });
  els.minimizeButton.addEventListener('click', () => window.daymark.minimize());
  els.maximizeButton.addEventListener('click', toggleMaximize);
  window.daymark.onMaximizedChange?.(updateMaximizeButton);
  window.daymark.isMaximized?.().then(updateMaximizeButton);
  els.closeButton.addEventListener('click', () => window.daymark.close());
  window.addEventListener('keydown', handleGlobalKeydown);
}

async function toggleMaximize() {
  const maximized = await window.daymark.toggleMaximize();
  updateMaximizeButton(Boolean(maximized));
}

function updateMaximizeButton(maximized) {
  if (!els.maximizeButton) return;
  els.maximizeButton.textContent = maximized ? '[#]' : '[ ]';
  els.maximizeButton.title = maximized ? 'Restore' : 'Maximize';
}
function startAnalyticsTracking() {
  state.lastActiveTick = Date.now();
  state.analyticsTimer = setInterval(recordActiveTime, 30000);
  window.addEventListener('beforeunload', () => recordActiveTime());
}

async function recordActiveTime() {
  await recordAnalyticsTime({ state, persist, renderAll });
}
function renderAll() {
  document.body.classList.toggle('analytics-mode', state.page === 'analytics');
  renderTabs();
  renderStatusStrip();
  renderPage();
  renderInspector();
  updateDesktopButton(Boolean(state.store.settings.desktopMode));
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
  const signals = signalsByStatus('INBOX');
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
    changeMonth,
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
function renderSignalsPage() {
  renderSignalsPageView({
    mount: els.pageMount,
    store: state.store,
    addTask,
    persist,
    renderAll,
    showToast,
    copy: (value) => window.daymark.copy(value)
  });
}

function signalsByStatus(status) {
  return selectSignalsByStatus(state.store, status);
}

function renderSignalsInspector() {
  renderSignalsInspectorView({ inspector: els.inspector, store: state.store });
}
function renderAnalyticsPage() {
  renderAnalyticsPageView({ mount: els.pageMount, analyticsDay });
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
  if (state.inspectorMode === 'roadmap' || state.inspectorMode === 'signals' || state.inspectorMode === 'log') {
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
function renderSettingsInspector() {
  const opacity = Number(state.store.settings.windowOpacity ?? 0.86);
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
      <div class="eyebrow">WINDOW</div>
      <button class="terminal-button full" type="button" data-command="desktop">${state.store.settings.desktopMode ? 'DETACH FROM DESKTOP' : 'ATTACH TO DESKTOP'}</button>
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
  els.inspector.querySelector('[data-command="desktop"]').addEventListener('click', () => setDesktopMode(!state.store.settings.desktopMode));
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

function handleGlobalKeydown(event) {
  if (isEditableTarget(event.target)) return;

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

function changeMonth(delta) {
  state.current = new Date(state.current.getFullYear(), state.current.getMonth() + delta, 1);
  state.selected = isoDate(state.current);
  renderAll();
}

function goToday() {
  selectDate(isoDate(new Date()));
}

function applySurfaceOpacity(opacity) {
  const value = Math.max(0, Math.min(1, Number(opacity)));
  document.documentElement.style.setProperty('--surface-alpha', String(value));
}

async function setDesktopMode(enabled, options = {}) {
  const result = enabled ? await window.daymark.enableDesktop() : await window.daymark.disableDesktop();
  if (!result.success) {
    state.store.settings.desktopMode = false;
    await persist();
    if (!options.quiet) showToast(result.message || '???? ?? ??? ??????');
    updateDesktopButton(false);
    renderStatusStrip();
    renderInspector();
    return;
  }

  state.store.settings.desktopMode = enabled;
  await persist();
  updateDesktopButton(enabled);
  renderStatusStrip();
  renderInspector();
  if (!options.quiet) showToast(result.message || (enabled ? '???? ??' : '? ??'));
}

function updateDesktopButton(enabled) {
  els.desktopButton.textContent = enabled ? 'WINDOW' : 'DESKTOP';
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














































