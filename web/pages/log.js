import { escapeHtml, isoDate } from '../utils.js';

export function renderLogPage({ mount, store }) {
  const entries = buildLogEntries(store);
  const page = document.createElement('section');
  page.className = 'log-page';
  page.innerHTML = '<div class="log-stream" data-log-stream></div>';
  mount.appendChild(page);

  renderLogStream(page.querySelector('[data-log-stream]'), entries);
}

export function renderLogInspector({ inspector, store }) {
  const entries = buildLogEntries(store);
  const doneTasks = entries.filter((entry) => entry.type === 'DONE').length;
  const handledSignals = entries.filter((entry) => entry.type === 'SIGNAL').length;
  inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">LOG</div>
      <h2>ACTIVITY</h2>
      <div class="kv"><span>EVENTS</span><strong>${entries.length}</strong></div>
      <div class="kv"><span>DONE</span><strong>${doneTasks}</strong></div>
      <div class="kv"><span>SIGNALS</span><strong>${handledSignals}</strong></div>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">SCOPE</div>
      <p class="muted">Derived from completed tasks and handled signals. A dedicated audit event store can be added later.</p>
    </div>
  `;
}

function renderLogStream(container, entries) {
  if (!entries.length) {
    container.innerHTML = '<p class="muted compact-empty">no completed work yet</p>';
    return;
  }

  const groups = groupEntriesByDay(entries);
  container.innerHTML = groups.map(([day, dayEntries]) => `
    <section class="log-day">
      <div class="log-day-head"><span>${escapeHtml(day)}</span><strong>${dayEntries.length}</strong></div>
      <div class="log-day-list">
        ${dayEntries.map(renderLogEntry).join('')}
      </div>
    </section>
  `).join('');
}

function renderLogEntry(entry) {
  return `
    <div class="log-entry type-${entry.type.toLowerCase()}">
      <span class="log-time">${escapeHtml(entry.time)}</span>
      <span class="log-type">${escapeHtml(entry.type)}</span>
      <span class="log-title">${escapeHtml(entry.title)}</span>
      <span class="log-meta">${escapeHtml(entry.meta)}</span>
    </div>
  `;
}

function buildLogEntries(store) {
  const taskEntries = (store.tasks || [])
    .filter((task) => task.completed)
    .map((task) => ({
      type: 'DONE',
      timestamp: task.updatedAt || task.createdAt || task.taskDate,
      title: task.content || 'Untitled task',
      meta: task.taskDate || 'no date'
    }));

  const signalEntries = (store.signals || [])
    .filter((signal) => signal.status && signal.status !== 'INBOX')
    .map((signal) => ({
      type: 'SIGNAL',
      timestamp: signal.updatedAt || signal.createdAt,
      title: signal.title || 'Untitled signal',
      meta: `${signal.source || 'Signal'} / ${formatSignalStatus(signal.status)}`
    }));

  return [...taskEntries, ...signalEntries]
    .filter((entry) => entry.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .map((entry) => ({ ...entry, day: formatEntryDay(entry.timestamp), time: formatEntryTime(entry.timestamp) }));
}

function groupEntriesByDay(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.day) || [];
    group.push(entry);
    groups.set(entry.day, group);
  }
  return Array.from(groups.entries());
}

function formatSignalStatus(status) {
  return String(status).replaceAll('_', ' ');
}

function formatEntryDay(value) {
  const date = parseEntryDate(value);
  return date ? isoDate(date) : String(value).slice(0, 10);
}

function formatEntryTime(value) {
  const date = parseEntryDate(value);
  if (!date) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseEntryDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
