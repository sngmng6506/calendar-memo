import { isoDate } from '../utils.js';

export function renderTodayPage({ mount, tasksForDate, renderDescriptionInput, addTask, removeTask, commitExisting, persist, renderAll }) {
  const today = isoDate(new Date());
  const todayTasks = tasksForDate(today);

  const page = document.createElement('section');
  page.className = 'today-page simple-today-page';
  page.innerHTML = `
    <div class="today-single-list">
      <div class="today-task-list" data-list="today"></div>
    </div>
  `;
  mount.appendChild(page);

  const actions = { renderDescriptionInput, addTask, removeTask, commitExisting, persist, renderAll };
  const list = page.querySelector('[data-list="today"]');
  renderTaskCollection(list, todayTasks, actions, { empty: '?? ??? ????.' });
  list.appendChild(renderTodayDraftRow(today, actions));
}

export function renderTodayInspector({ inspector, tasksForDate, completeTodayOpenTasks }) {
  const today = isoDate(new Date());
  const tasks = tasksForDate(today);
  const open = tasks.filter((task) => !task.completed).length;
  const done = tasks.length - open;
  inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">TODAY</div>
      <h2>${today}</h2>
      <div class="kv"><span>TASKS</span><strong>${tasks.length}</strong></div>
      <div class="kv"><span>OPEN</span><strong>${open}</strong></div>
      <div class="kv"><span>DONE</span><strong>${done}</strong></div>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">COMMANDS</div>
      <button class="terminal-button full" type="button" data-command="complete-today">${open ? 'COMPLETE ALL OPEN' : 'REOPEN ALL'}</button>
    </div>
  `;
  inspector.querySelector('[data-command="complete-today"]').addEventListener('click', completeTodayOpenTasks);
}

export async function completeTodayOpenTasks({ tasksForDate, persist, renderAll, showToast }) {
  const today = isoDate(new Date());
  const tasks = tasksForDate(today);
  if (!tasks.length) {
    showToast('??? ?? ??? ????');
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
  showToast(shouldComplete ? `?? ?? ${targets.length}?? ?? ??????` : `?? ?? ${targets.length}?? ?? ?????`);
}

function renderTaskCollection(container, tasks, actions, options = {}) {
  if (!tasks.length && options.empty) {
    const empty = document.createElement('p');
    empty.className = 'muted compact-empty';
    empty.textContent = options.empty;
    container.appendChild(empty);
  }
  for (const task of tasks) container.appendChild(renderTodayTaskRow(task, actions));
}

function renderTodayTaskRow(task, actions) {
  const row = document.createElement('div');
  row.className = `today-task ${task.completed ? 'completed' : ''}`;
  row.draggable = true;
  row.dataset.taskId = task.id;
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  });

  const check = document.createElement('button');
  check.className = 'check';
  check.type = 'button';
  check.textContent = task.completed ? '[x]' : '[ ]';
  check.addEventListener('click', async () => {
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    await actions.persist();
    actions.renderAll();
  });

  const body = document.createElement('div');
  body.className = 'today-task-body';
  const input = document.createElement('input');
  input.className = 'task-input';
  input.value = task.content;
  input.spellcheck = false;
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await actions.commitExisting(task, input.value);
    }
    if (event.key === 'Backspace' && input.value === '') {
      event.preventDefault();
      actions.removeTask(task.id);
      await actions.persist();
      actions.renderAll();
    }
  });
  input.addEventListener('blur', () => actions.commitExisting(task, input.value));

  const remove = document.createElement('button');
  remove.className = 'task-delete';
  remove.type = 'button';
  remove.title = 'Delete task';
  remove.textContent = 'DEL';
  remove.addEventListener('click', async () => {
    actions.removeTask(task.id);
    await actions.persist();
    actions.renderAll();
  });

  body.append(input, actions.renderDescriptionInput(task, 'description-input today-description terminal-description'));
  row.append(check, body, remove);
  return row;
}

function handleDraftDescriptionTab(event, textarea) {
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
    
    return true;
  }

  if (bulletMatch) {
    textarea.value = value.slice(0, lineStart) + '  ' + value.slice(lineStart);
    textarea.selectionStart = textarea.selectionEnd = start + 2;
    
    return true;
  }

  const token = line.trim().length ? '  ' : '  \u2022 ';
  textarea.value = value.slice(0, start) + token + value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + token.length;
  
  return true;
}
function renderTodayDraftRow(taskDate, actions) {
  const row = document.createElement('div');
  row.className = 'today-task draft';

  const marker = document.createElement('span');
  marker.className = 'draft-marker';
  marker.textContent = '+';

  const body = document.createElement('div');
  body.className = 'today-task-body';
  const input = document.createElement('input');
  input.className = 'task-input';
  input.placeholder = 'today task';
  input.spellcheck = false;
  const description = document.createElement('textarea');
  description.className = 'description-input today-description terminal-description';
  description.placeholder = 'description';
  description.spellcheck = false;
  description.addEventListener('keydown', (event) => handleDraftDescriptionTab(event, description));

  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    actions.addTask(taskDate, content, null, description.value.trim(), Math.max(description.offsetHeight, description.scrollHeight, 34));
    await actions.persist();
    actions.renderAll();
  });

  body.append(input, description);
  row.append(marker, body);
  return row;
}