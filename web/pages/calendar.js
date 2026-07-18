import { isoDate, monthMatrix, pad2 } from '../utils.js';

const weekdayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function renderCalendarPage({ mount, current, selected, tasksForDate, changeMonth, goToday, carryIncomplete, selectDate, moveTaskToDate }) {
  const page = document.createElement('section');
  page.className = 'calendar-page';
  page.innerHTML = `
    <div class="panel-header">
      <div>
        <div class="eyebrow">MONTH BOARD</div>
        <h1>${current.getFullYear()} / ${pad2(current.getMonth() + 1)}</h1>
      </div>
      <div class="panel-actions">
        <button class="terminal-button" type="button" data-action="prev">PREV</button>
        <button class="terminal-button" type="button" data-action="today">TODAY</button>
        <button class="terminal-button" type="button" data-action="carry">CARRY OPEN</button>
        <button class="terminal-button" type="button" data-action="next">NEXT</button>
      </div>
    </div>
    <div class="weekday-row"></div>
    <div class="calendar-grid"></div>
  `;
  mount.appendChild(page);

  page.querySelector('[data-action="prev"]').addEventListener('click', () => changeMonth(-1));
  page.querySelector('[data-action="next"]').addEventListener('click', () => changeMonth(1));
  page.querySelector('[data-action="today"]').addEventListener('click', goToday);
  page.querySelector('[data-action="carry"]').addEventListener('click', carryIncomplete);

  const weekdayRow = page.querySelector('.weekday-row');
  for (const label of weekdayLabels) {
    const node = document.createElement('div');
    node.className = 'weekday';
    if (label === 'SAT') node.classList.add('saturday');
    if (label === 'SUN') node.classList.add('sunday');
    node.textContent = label;
    weekdayRow.appendChild(node);
  }

  const options = { current, selected, tasksForDate, selectDate, moveTaskToDate };
  const grid = page.querySelector('.calendar-grid');
  for (const date of monthMatrix(current)) grid.appendChild(renderDay(date, options));
}

function renderDay(date, options) {
  const { current, selected, tasksForDate, selectDate, moveTaskToDate } = options;
  const id = isoDate(date);
  const cell = document.createElement('section');
  cell.className = 'day-cell';
  cell.tabIndex = id === selected ? 0 : -1;
  cell.dataset.date = id;
  cell.setAttribute('role', 'button');
  cell.setAttribute('aria-selected', id === selected ? 'true' : 'false');
  if (date.getMonth() !== current.getMonth()) cell.classList.add('outside');
  if (date.getDay() === 6) cell.classList.add('saturday');
  if (date.getDay() === 0) cell.classList.add('sunday');
  if (id === isoDate(new Date())) cell.classList.add('today');
  if (id === selected) cell.classList.add('selected');
  cell.addEventListener('click', () => selectDate(id));
  cell.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes('text/plain')) return;
    event.preventDefault();
    cell.classList.add('drag-over');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
  cell.addEventListener('drop', async (event) => {
    event.preventDefault();
    cell.classList.remove('drag-over');
    const taskId = event.dataTransfer.getData('text/plain');
    await moveTaskToDate(taskId, id);
  });

  const tasks = tasksForDate(id);
  const done = tasks.filter((task) => task.completed).length;
  const head = document.createElement('div');
  head.className = 'day-head';
  head.innerHTML = `
    <span class="day-number">${date.getDate()}</span>
    <span class="day-meta">${tasks.length ? `${done}/${tasks.length}` : '--'}</span>
  `;
  cell.appendChild(head);

  const preview = document.createElement('div');
  preview.className = 'task-preview-list';
  for (const task of tasks.slice(0, 4)) preview.appendChild(renderTaskPreview(task, selectDate));
  if (tasks.length > 4) {
    const more = document.createElement('div');
    more.className = 'task-preview more';
    more.textContent = `+${tasks.length - 4} more`;
    preview.appendChild(more);
  }
  cell.appendChild(preview);
  return cell;
}

function renderTaskPreview(task, selectDate) {
  const item = document.createElement('div');
  item.className = `task-preview ${task.completed ? 'completed' : ''}`;
  item.draggable = true;
  item.dataset.taskId = task.id;
  item.textContent = `${task.completed ? '[x]' : '[ ]'} ${task.content}`;
  item.addEventListener('click', (event) => {
    event.stopPropagation();
    selectDate(task.taskDate);
  });
  item.addEventListener('dragstart', (event) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  });
  return item;
}