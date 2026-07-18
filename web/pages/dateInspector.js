import { escapeHtml } from '../utils.js';

export function renderDateInspector({ inspector, selected, tasksForDate, carryIncomplete, completeSelectedOpenTasks, copySelectedSummary, addTask, removeTask, commitExisting, persist, renderAll, focusInspectorDraft }) {
  const tasks = tasksForDate(selected);
  const done = tasks.filter((task) => task.completed).length;
  const open = tasks.length - done;
  inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">INSPECTOR</div>
      <h2>${escapeHtml(selected)}</h2>
      <div class="kv"><span>TASKS</span><strong>${tasks.length}</strong></div>
      <div class="kv"><span>OPEN</span><strong>${open}</strong></div>
      <div class="kv"><span>DONE</span><strong>${done}</strong></div>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">COMMANDS</div>
      <button class="terminal-button full" type="button" data-command="carry">CARRY OPEN TO TODAY</button>
      <button class="terminal-button full" type="button" data-command="complete-all">${open ? 'COMPLETE ALL OPEN' : 'REOPEN ALL'}</button>
      <button class="terminal-button full" type="button" data-command="copy">COPY DATE SUMMARY</button>
    </div>
    <div class="inspector-block task-editor"></div>
  `;

  inspector.querySelector('[data-command="carry"]').addEventListener('click', carryIncomplete);
  inspector.querySelector('[data-command="complete-all"]').addEventListener('click', completeSelectedOpenTasks);
  inspector.querySelector('[data-command="copy"]').addEventListener('click', copySelectedSummary);

  const actions = { addTask, removeTask, commitExisting, persist, renderAll, focusInspectorDraft };
  const editor = inspector.querySelector('.task-editor');
  editor.innerHTML = '<div class="eyebrow">SELECTED TASKS</div>';
  const list = document.createElement('div');
  list.className = 'inspector-task-list';
  for (const task of tasks) list.appendChild(renderInspectorTaskRow(task, actions));
  list.appendChild(renderInspectorDraftRow(selected, actions));
  editor.appendChild(list);
}

function renderInspectorTaskRow(task, actions) {
  const row = document.createElement('div');
  row.className = `task-row inspector-task ${task.completed ? 'completed' : ''}`;
  row.draggable = true;
  row.dataset.taskId = task.id;
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  });

  const check = document.createElement('button');
  check.className = 'check';
  check.type = 'button';
  check.title = task.completed ? '???? ??' : '??';
  check.textContent = task.completed ? '[x]' : '[ ]';
  check.addEventListener('click', async () => {
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    await actions.persist();
    actions.renderAll();
  });

  const input = document.createElement('input');
  input.className = 'task-input';
  input.value = task.content;
  input.spellcheck = false;
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await actions.commitExisting(task, input.value);
      actions.focusInspectorDraft();
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

  row.append(check, input, remove);
  return row;
}

function renderInspectorDraftRow(taskDate, actions) {
  const row = document.createElement('div');
  row.className = 'task-row inspector-task draft';

  const marker = document.createElement('span');
  marker.className = 'draft-marker';
  marker.textContent = '+';

  const input = document.createElement('input');
  input.className = 'task-input';
  input.placeholder = '?? ??';
  input.dataset.inspectorDraft = 'true';
  input.spellcheck = false;
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    actions.addTask(taskDate, content);
    await actions.persist();
    actions.renderAll();
    actions.focusInspectorDraft();
  });

  row.append(marker, input);
  return row;
}