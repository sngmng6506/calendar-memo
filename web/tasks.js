import { isoDate, startOfMonth } from './utils.js';

export function addTask(store, taskDate, content, originTaskId = null, description = '', descriptionHeight = 0) {
  const sortOrder = tasksForDate(store, taskDate).length;
  store.tasks.push({
    id: crypto.randomUUID(),
    taskDate,
    content,
    description,
    descriptionHeight,
    completed: false,
    sortOrder,
    originTaskId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function removeTask(store, taskId) {
  const task = store.tasks.find((item) => item.id === taskId);
  store.tasks = store.tasks.filter((item) => item.id !== taskId);
  if (task) normalizeOrders(store, task.taskDate);
}

export function normalizeOrders(store, taskDate) {
  tasksForDate(store, taskDate).forEach((task, index) => task.sortOrder = index);
}

export function tasksForDate(store, taskDate) {
  return store.tasks
    .filter((task) => task.taskDate === taskDate)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt));
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