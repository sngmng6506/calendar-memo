import { isoDate, startOfMonth } from './utils.js';

export function addTask(store, taskDate, content, originTaskId = null, description = '', descriptionHeight = 0) {
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    taskDate,
    content,
    description,
    descriptionHeight,
    completed: false,
    sortOrder: tasksForDate(store, taskDate).length,
    originTaskId,
    createdAt: now,
    updatedAt: now
  };
  store.tasks.push(task);
  return task;
}

export function removeTask(store, taskId) {
  const task = store.tasks.find((item) => item.id === taskId);
  store.tasks = store.tasks.filter((item) => item.id !== taskId);
  if (!task) return;

  const deletedAt = new Date().toISOString();
  store.deleted ||= [];
  const existing = store.deleted.find((item) => item.collection === 'tasks' && item.recordId === task.id);
  if (existing) {
    existing.deletedAt = deletedAt;
    delete existing.syncedAt;
  } else {
    store.deleted.push({ collection: 'tasks', recordId: task.id, deletedAt });
  }
  normalizeOrders(store, task.taskDate, deletedAt);
}

export function normalizeOrders(store, taskDate, updatedAt = new Date().toISOString()) {
  tasksForDate(store, taskDate).forEach((task, index) => {
    if (task.sortOrder === index) return;
    task.sortOrder = index;
    task.updatedAt = updatedAt;
  });
}

export function tasksForDate(store, taskDate) {
  return store.tasks
    .filter((task) => task.taskDate === taskDate)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function tasksForVisibleMonth(store, current) {
  const start = isoDate(startOfMonth(current));
  const end = isoDate(new Date(current.getFullYear(), current.getMonth() + 1, 0));
  return store.tasks.filter((task) => task.taskDate >= start && task.taskDate <= end);
}

export function dayTaskStats(store, dayId) {
  const tasks = tasksForDate(store, dayId);
  const done = tasks.filter((task) => task.completed).length;
  return { total: tasks.length, done, open: tasks.length - done };
}

export function aggregateTaskStats(store, days) {
  return days.reduce((acc, day) => {
    const stats = dayTaskStats(store, day);
    acc.total += stats.total;
    acc.done += stats.done;
    acc.open += stats.open;
    return acc;
  }, { total: 0, done: 0, open: 0 });
}

export function formatTaskSummaryLine(task) {
  const lines = [`${task.completed ? '[x]' : '[ ]'} ${task.content}`];
  if (task.description) lines.push(`    ${task.description}`);
  return lines.join('\n');
}
