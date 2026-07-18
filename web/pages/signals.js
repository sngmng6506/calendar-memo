import { escapeHtml, isoDate } from '../utils.js';

export function renderSignalsPage({ mount, store, addTask, persist, renderAll, showToast, copy }) {
  const inbox = signalsByStatus(store, 'INBOX');
  const sent = signalsByStatus(store, 'SENT_TO_TODAY');
  const dismissed = signalsByStatus(store, 'DISMISSED');

  const page = document.createElement('section');
  page.className = 'signals-page';
  page.innerHTML = `
    <div class="signals-list" data-list="signals"></div>
    <form class="signal-compose" data-form="signal">
      <select class="signal-source" name="source" aria-label="source">
        <option>Memo</option>
        <option>GitHub</option>
        <option>Mail</option>
        <option>Calendar</option>
        <option>Discord</option>
        <option>Slack</option>
        <option>RSS</option>
        <option>URL</option>
      </select>
      <input class="signal-title" name="title" placeholder="signal title" autocomplete="off">
      <input class="signal-url" name="url" placeholder="url" autocomplete="off">
      <textarea class="signal-note" name="note" placeholder="note"></textarea>
      <button class="terminal-button" type="submit">ADD SIGNAL</button>
    </form>
  `;
  mount.appendChild(page);

  const actions = { store, addTask, persist, renderAll, showToast, copy };
  const list = page.querySelector('[data-list="signals"]');
  renderSignalGroup(list, 'INBOX', inbox, actions);
  renderSignalGroup(list, 'SENT TO TODAY', sent, actions);
  renderSignalGroup(list, 'DISMISSED', dismissed, actions);

  page.querySelector('[data-form="signal"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    if (!title) return;
    addSignal(store, {
      source: String(form.get('source') || 'Memo'),
      title,
      url: String(form.get('url') || '').trim(),
      note: String(form.get('note') || '').trim()
    });
    await persist();
    renderAll();
  });
}

export function renderSignalsInspector({ inspector, store }) {
  const inbox = signalsByStatus(store, 'INBOX').length;
  const sent = signalsByStatus(store, 'SENT_TO_TODAY').length;
  const dismissed = signalsByStatus(store, 'DISMISSED').length;
  inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">SIGNALS</div>
      <h2>INBOX</h2>
      <div class="kv"><span>INBOX</span><strong>${inbox}</strong></div>
      <div class="kv"><span>TODAY</span><strong>${sent}</strong></div>
      <div class="kv"><span>DISMISSED</span><strong>${dismissed}</strong></div>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">CONNECTORS</div>
      <p class="muted">Manual inbox now. GitHub, Mail, Calendar, and RSS can feed this same structure later.</p>
    </div>
  `;
}

export function signalsByStatus(store, status) {
  return (store.signals || [])
    .filter((signal) => signal.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function renderSignalGroup(container, label, signals, actions) {
  const group = document.createElement('section');
  group.className = 'signal-group';
  const head = document.createElement('div');
  head.className = 'signal-group-head';
  head.innerHTML = `<span>${escapeHtml(label)}</span><strong>${signals.length}</strong>`;
  group.appendChild(head);

  if (!signals.length) {
    const empty = document.createElement('p');
    empty.className = 'muted compact-empty';
    empty.textContent = 'empty';
    group.appendChild(empty);
  } else {
    for (const signal of signals) group.appendChild(renderSignalRow(signal, actions));
  }
  container.appendChild(group);
}

function renderSignalRow(signal, actions) {
  const row = document.createElement('div');
  row.className = `signal-row status-${signal.status.toLowerCase()}`;
  row.innerHTML = `
    <div class="signal-main">
      <span class="signal-source-label">${escapeHtml(signal.source)}</span>
      <span class="signal-title-label">${escapeHtml(signal.title)}</span>
    </div>
    ${signal.note ? `<div class="signal-note-line">${escapeHtml(signal.note)}</div>` : ''}
    ${signal.url ? `<div class="signal-url-line">${escapeHtml(signal.url)}</div>` : ''}
    <div class="signal-actions"></div>
  `;
  const rowActions = row.querySelector('.signal-actions');
  rowActions.appendChild(signalButton('TODAY', () => sendSignalToToday(signal.id, actions)));
  rowActions.appendChild(signalButton(signal.status === 'DISMISSED' ? 'RESTORE' : 'DISMISS', () => toggleSignalDismiss(signal.id, actions)));
  if (signal.url) rowActions.appendChild(signalButton('COPY URL', () => actions.copy(signal.url)));
  return row;
}

function signalButton(label, action) {
  const button = document.createElement('button');
  button.className = 'terminal-button signal-action';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function addSignal(store, { source, title, url, note }) {
  store.signals.push({
    id: crypto.randomUUID(),
    source,
    title,
    url,
    note,
    status: 'INBOX',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

async function sendSignalToToday(signalId, actions) {
  const signal = actions.store.signals.find((item) => item.id === signalId);
  if (!signal) return;
  actions.addTask(isoDate(new Date()), signal.title, null, signal.note || signal.url || '');
  signal.status = 'SENT_TO_TODAY';
  signal.updatedAt = new Date().toISOString();
  await actions.persist();
  actions.renderAll();
  actions.showToast('Signal? ?? ??? ?????');
}

async function toggleSignalDismiss(signalId, actions) {
  const signal = actions.store.signals.find((item) => item.id === signalId);
  if (!signal) return;
  signal.status = signal.status === 'DISMISSED' ? 'INBOX' : 'DISMISSED';
  signal.updatedAt = new Date().toISOString();
  await actions.persist();
  actions.renderAll();
}