import { addDays, escapeHtml, isoDate, monthMatrix, parseIso, startOfMonth } from './utils.js';
import {
  analyticsDay as ensureAnalyticsDay,
  recordActiveTime as recordAnalyticsTime,
  renderAnalyticsPage as renderAnalyticsPageView
} from './pages/analytics.js';
import { renderCalendarPage as renderCalendarPageView } from './pages/calendar.js';
import { renderDateInspector as renderDateInspectorView } from './pages/dateInspector.js';
import { renderSettingsInspector as renderSettingsInspectorView } from './pages/settings.js';
import {
  completeTodayOpenTasks as completeTodayOpenTasksAction,
  renderTodayInspector as renderTodayInspectorView,
  renderTodayPage as renderTodayPageView
} from './pages/today.js';
import {
  addTask as createTask,
  formatTaskSummaryLine,
  normalizeOrders as reorderTasks,
  removeTask as deleteTask,
  tasksForDate as selectTasksForDate,
  tasksForVisibleMonth as selectTasksForVisibleMonth
} from './tasks.js';
import { seedDemoData } from './devSeed.js';
import { createDescriptionEditor } from './controllers/descriptionEditor.js';
import { createDesktopController } from './controllers/desktopController.js';
import { createPersistenceController } from './controllers/persistence.js';
import { createSyncController } from './controllers/syncController.js';

const pageRegistry = [
  { id: 'calendar', label: 'CALENDAR', render: renderCalendarPage },
  { id: 'today', label: 'TODAY', render: renderTodayPage },
  { id: 'analytics', label: 'ANALYTICS', render: renderAnalyticsPage }
];

const state = {
  store: { tasks: [], signals: [], analytics: { days: {} }, reports: [], deleted: [], settings: {}, meta: {} },
  current: startOfMonth(new Date()),
  selected: isoDate(new Date()),
  page: 'calendar',
  inspectorMode: 'date',
  selectedTaskId: null,
  displayBounds: null,
  autoStart: false,
  adjustingDesktopSize: false,
  resumeDesktopAfterAdjust: false,
  toastTimer: null,
  analyticsTimer: null,
  lastActiveTick: null
};

const els = {};
let persistence;
let syncController;
let desktopController;
let descriptionEditor;

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  bindElements();
  state.store = await window.daymark.loadStore();
  persistence = createPersistenceController({
    state,
    saveStore: (store) => window.daymark.saveStore(store)
  });
  syncController = createSyncController({
    state,
    persist,
    syncStore: (store) => window.daymark.syncStore(store),
    renderAll,
    showToast
  });
  desktopController = createDesktopController({
    state,
    els,
    persist,
    renderAll,
    showToast,
    openSettings: () => {
      state.inspectorMode = 'settings';
      renderAll();
    }
  });
  descriptionEditor = createDescriptionEditor({ persist, renderAll });

  await desktopController.init();
  bindActions();
  startAnalyticsTracking();
  syncController.start();
  renderAll();

  if (state.store.settings.desktopMode) {
    await desktopController.setDesktopMode(true, { quiet: true });
  }

  window.addEventListener('beforeunload', () => {
    recordActiveTime();
    syncController.stop();
    desktopController.dispose();
    persistence.flush();
  }, { once: true });
}

function bindElements() {
  for (const id of [
    'pageTabs', 'statusStrip', 'pageMount', 'inspector',
    'settingsButton', 'toast', 'sizeAdjustBar', 'resizeHandles'
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindActions() {
  els.settingsButton.addEventListener('click', () => {
    state.inspectorMode = state.inspectorMode === 'settings'
      ? (state.page === 'calendar' ? 'date' : state.page)
      : 'settings';
    renderAll();
  });
  els.pageMount.addEventListener('click', handleTaskContainerClick);
  els.inspector.addEventListener('click', handleTaskContainerClick);
  window.addEventListener('keydown', handleGlobalKeydown);
}

function startAnalyticsTracking() {
  state.lastActiveTick = Date.now();
  clearInterval(state.analyticsTimer);
  state.analyticsTimer = setInterval(recordActiveTime, 30000);
}

async function recordActiveTime() {
  await recordAnalyticsTime({ state, persist, renderAll });
}

function persist(options = {}) {
  return persistence.persist(options);
}

function renderAll() {
  document.body.classList.toggle('analytics-mode', state.page === 'analytics');
  document.body.classList.toggle('desktop-mode', Boolean(state.store.settings.desktopMode));
  document.body.classList.toggle('settings-open', state.inspectorMode === 'settings');
  renderTabs();
  renderStatusStrip();
  renderPage();
  renderInspector();
  applyTaskSelection();
  desktopController.renderSizeAdjustBar();
  desktopController.renderResizeHandles();
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
  const selectedTasks = tasksForDate(state.selected);
  const today = isoDate(new Date());
  const carry = state.store.tasks.filter((task) => task.taskDate < today && !task.completed).length;
  const rows = [
    ['TASKS', String(monthTasks.length)],
    ['DONE', String(done)],
    ['OPEN', String(monthTasks.length - done)],
    ['SELECTED OPEN', String(selectedTasks.filter((task) => !task.completed).length)],
    ['CARRY', String(carry)]
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
  els.pageMount.innerHTML = '';
  activePage().render();
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
    renderDescriptionInput: descriptionEditor.renderDescriptionInput,
    addTask,
    removeTask,
    commitExisting,
    persist,
    renderAll
  });
}

function renderAnalyticsPage() {
  renderAnalyticsPageView({ mount: els.pageMount, analyticsDay, store: state.store });
}

function renderInspector() {
  els.settingsButton.classList.toggle('active', state.inspectorMode === 'settings');
  if (state.inspectorMode === 'settings') {
    renderSettingsInspectorView({
      inspector: els.inspector,
      state,
      desktop: desktopController,
      sync: syncController
    });
    return;
  }
  if (state.inspectorMode === 'today') {
    renderTodayInspectorView({ inspector: els.inspector, tasksForDate, completeTodayOpenTasks });
    return;
  }
  if (state.inspectorMode === 'analytics') {
    els.inspector.innerHTML = '';
    return;
  }
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

function analyticsDay(dayId) {
  return ensureAnalyticsDay(state.store, dayId);
}

async function completeTodayOpenTasks() {
  await completeTodayOpenTasksAction({ tasksForDate, persist, renderAll, showToast });
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
  return Boolean(active?.closest?.('[data-task-id]'));
}

function applyTaskSelection() {
  const rows = taskRowEls();
  if (!rows.some((row) => row.dataset.taskId === state.selectedTaskId)) state.selectedTaskId = null;
  for (const row of rows) row.classList.toggle('task-selected', row.dataset.taskId === state.selectedTaskId);
}

function selectTask(taskId, options = {}) {
  state.selectedTaskId = taskId;
  applyTaskSelection();
  if (options.focus) focusTaskRow(taskId);
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
  if (nextId) requestAnimationFrame(() => focusTaskRow(nextId));
  else if (state.inspectorMode === 'date') focusInspectorDraft();
}

function handleGlobalKeydown(event) {
  if (isEditableTarget(event.target)) return;
  if (isButtonTarget(event.target) && (event.key === 'Enter' || event.key === ' ')) return;

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
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
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
  if (!visibleDates().includes(taskDate)) state.current = startOfMonth(parseIso(taskDate));
  state.page = 'calendar';
  state.inspectorMode = 'date';
  renderAll();
  requestAnimationFrame(() => document.querySelector(`.day-cell[data-date="${taskDate}"]`)?.focus());
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
  showToast(`Moved task to ${taskDate}`);
}

async function commitExisting(task, value) {
  const content = value.trim();
  if (!content) removeTask(task.id);
  else if (task.content !== content) {
    task.content = content;
    task.updatedAt = new Date().toISOString();
  } else return;
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
  const latest = new Map();
  for (const task of state.store.tasks.filter((item) => item.taskDate < today)) {
    latest.set(task.originTaskId || task.id, task);
  }
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
  showToast(copied ? `Carried ${copied} open task(s)` : 'No open tasks to carry');
}

async function completeSelectedOpenTasks() {
  const tasks = tasksForDate(state.selected);
  if (!tasks.length) {
    showToast('No tasks on the selected date');
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
  showToast(shouldComplete ? `Completed ${targets.length} task(s)` : `Reopened ${targets.length} task(s)`);
}

async function copySelectedSummary() {
  const tasks = tasksForDate(state.selected);
  const lines = [state.selected, ...tasks.map(formatTaskSummaryLine)];
  await window.daymark.copy(lines.join('\n'));
  showToast('Copied date summary');
}

function goToday() {
  selectDate(isoDate(new Date()));
}

function activePage() {
  return pageRegistry.find((page) => page.id === state.page) || pageRegistry[0];
}

function visibleDates() {
  return monthMatrix(state.current).map(isoDate);
}

function focusInspectorDraft() {
  requestAnimationFrame(() => document.querySelector('[data-inspector-draft="true"]')?.focus());
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

function isButtonTarget(target) {
  return target instanceof HTMLElement && target.tagName === 'BUTTON';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}
