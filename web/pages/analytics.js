import { addDays, escapeHtml, formatDuration, isoDate, pad2 } from '../utils.js';

const CLOCK_BIN_COUNT = 96;
const CLOCK_BIN_MINUTES = 15;
const AVG_DAY_COUNT = 7;

export function renderAnalyticsPage({ mount, analyticsDay, store }) {
  const today = isoDate(new Date());
  const todayAnalytics = analyticsDay(today);
  const activeToday = todayAnalytics.activeSeconds || 0;
  const clockBins = clockBinsForDay(todayAnalytics);
  const averageBins = recentAverageBins(store, today, AVG_DAY_COUNT);
  const recentCompletion = completionDaysForRecentDays(store, new Date(), 30);

  const page = document.createElement('section');
  page.className = 'analytics-page analytics-quadrants';
  page.innerHTML = `
    <section class="analytics-panel active-clock-panel">
      <div class="analytics-panel-head"><span>When did you focus?</span><strong>${formatDuration(activeToday)}</strong></div>
      <div class="active-clock" data-active-clock></div>
    </section>
    <section class="analytics-panel recent-completion-panel">
      <div class="analytics-panel-head"><span>What did you finish?</span></div>
      <div class="recent-completion" data-recent-completion></div>
    </section>
    <section class="analytics-panel empty-panel"><div class="analytics-panel-head"><span>What changed?</span><strong>03</strong></div></section>
    <section class="analytics-panel empty-panel"><div class="analytics-panel-head"><span>What is next?</span><strong>04</strong></div></section>
  `;
  mount.appendChild(page);
  renderActiveClock(page.querySelector('[data-active-clock]'), clockBins, activeToday, averageBins);
  renderRecentCompletion(page.querySelector('[data-recent-completion]'), recentCompletion);
}

export function renderActiveClock(container, bins, activeSeconds = 0, averageBins = []) {
  // The 7-day average ring reaches r=220 (see renderAveragePath), so the box has
  // to clear 220 from the centre or that path gets clipped.
  const size = 460;
  const center = size / 2;
  const max = Math.max(0, ...bins, ...averageBins);
  const total = Number(activeSeconds || 0);
  let S = 0;
  let C = 0;
  let W = 0;

  bins.forEach((seconds, index) => {
    const t = ((index + 0.5) / bins.length) * 2 * Math.PI;
    S += seconds * Math.sin(t);
    C += seconds * Math.cos(t);
    W += seconds;
  });

  const R = W ? Math.hypot(S, C) / W : 0;
  const mu = (Math.atan2(S, C) + 2 * Math.PI) % (2 * Math.PI);
  const peakHour = (mu * 24) / (2 * Math.PI);
  const peakHourInt = Math.floor(peakHour);
  const peakMinute = Math.round((peakHour - peakHourInt) * 60);
  const peakText = R >= 0.4
    ? `${pad2((peakHourInt + Math.floor(peakMinute / 60)) % 24)}:${pad2(peakMinute % 60)}`
    : '--:--';

  const averagePath = renderAveragePath(averageBins, max, center);
  const rings = bins.map((seconds, index) => {
    const angle = (((index + 0.5) / bins.length) * Math.PI * 2) - Math.PI / 2;
    const ratio = max ? seconds / max : 0;
    const inner = 96;
    const length = 18 + Math.round(ratio * 44);
    const x1 = center + Math.cos(angle) * inner;
    const y1 = center + Math.sin(angle) * inner;
    const x2 = center + Math.cos(angle) * (inner + length);
    const y2 = center + Math.sin(angle) * (inner + length);
    const density = ratio === 0 ? 'd0' : ratio <= 0.25 ? 'd1' : ratio <= 0.5 ? 'd2' : ratio <= 0.75 ? 'd3' : 'd4';
    return `<line class="clock-hour ${density}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"><title>${formatBinLabel(index)} ${formatDuration(seconds)}</title></line>`;
  }).join('');

  const labels = [0, 6, 12, 18].map((hour) => {
    const angle = ((hour / 24) * Math.PI * 2) - Math.PI / 2;
    const x = center + Math.cos(angle) * 158;
    const y = center + Math.sin(angle) * 158;
    return `<text class="clock-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${pad2(hour)}</text>`;
  }).join('');

  const peakMarker = R >= 0.4 ? (() => {
    const angle = ((peakHour / 24) * Math.PI * 2) - Math.PI / 2;
    const x1 = center + Math.cos(angle) * 56;
    const y1 = center + Math.sin(angle) * 56;
    const x2 = center + Math.cos(angle) * 90;
    const y2 = center + Math.sin(angle) * 90;
    return `<line class="clock-peak" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"><title>Peak ${peakText}</title></line>`;
  })() : '';

  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Active time by 15-minute interval">
      <circle class="clock-ring" cx="${center}" cy="${center}" r="90"></circle>
      <circle class="clock-center" cx="${center}" cy="${center}" r="48"></circle>
      ${averagePath}
      ${rings}
      ${labels}
      ${peakMarker}
      <text class="clock-core" x="${center}" y="${center - 4}">${formatDuration(total)}</text>
      <text class="clock-sub" x="${center}" y="${center + 14}">${peakText}</text>
    </svg>
  `;
}

export function analyticsDay(store, dayId) {
  store.analytics ||= { days: {} };
  store.analytics.days ||= {};
  store.analytics.days[dayId] ||= createAnalyticsDay();
  const day = store.analytics.days[dayId];
  day.hours = normalizeFixedArray(day.hours, 24);
  day.bins15 = normalizeFixedArray(day.bins15, CLOCK_BIN_COUNT);
  return day;
}

export async function recordActiveTime({ state, persist, renderAll }) {
  const now = Date.now();
  const previous = state.lastActiveTick || now;
  const delta = Math.max(0, Math.min(120, Math.round((now - previous) / 1000)));
  state.lastActiveTick = now;
  if (!delta) return;

  const current = new Date();
  const day = analyticsDay(state.store, isoDate(current));
  const hour = current.getHours();
  const bin = hour * 4 + Math.floor(current.getMinutes() / CLOCK_BIN_MINUTES);
  day.activeSeconds = (day.activeSeconds || 0) + delta;
  day.hours[hour] += delta;
  day.bins15[bin] += delta;
  day.lastSeenAt = current.toISOString();
  day.updatedAt = day.lastSeenAt;
  await persist();
  if (state.page === 'analytics') renderAll();
}

function createAnalyticsDay() {
  return {
    activeSeconds: 0,
    hours: Array.from({ length: 24 }, () => 0),
    bins15: Array.from({ length: CLOCK_BIN_COUNT }, () => 0)
  };
}

function recentAverageBins(store, todayId, count) {
  const today = parseDateId(todayId);
  const totals = Array.from({ length: CLOCK_BIN_COUNT }, () => 0);
  let days = 0;

  for (let offset = 1; offset <= count; offset += 1) {
    const day = store?.analytics?.days?.[isoDate(addDays(today, -offset))];
    if (!day) continue;
    const bins = clockBinsForDay(day);
    if (!bins.some((seconds) => seconds > 0)) continue;
    bins.forEach((seconds, index) => totals[index] += seconds);
    days += 1;
  }

  if (!days) return [];
  return totals.map((seconds) => seconds / days);
}

function clockBinsForDay(day) {
  const bins = normalizeFixedArray(day.bins15, CLOCK_BIN_COUNT);
  if (bins.some((seconds) => seconds > 0)) return bins;

  const hours = normalizeFixedArray(day.hours, 24);
  return hours.flatMap((seconds) => Array.from({ length: 4 }, () => seconds / 4));
}

function renderAveragePath(averageBins, max, center) {
  if (!max || !averageBins.some((seconds) => seconds > 0)) return '';
  const points = averageBins.map((seconds, index) => {
    const angle = (((index + 0.5) / averageBins.length) * Math.PI * 2) - Math.PI / 2;
    const ratio = Math.pow(seconds / max, 1.7);
    const radius = 98 + ratio * 122;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius
    };
  });
  return `<path class="clock-average" d="${smoothClosedPath(points)}"><title>7D average pattern</title></path>`;
}


function completionDaysForRecentDays(store, today, count) {
  const statsByDay = new Map();
  let done = 0;
  let total = 0;

  for (const task of store?.tasks || []) {
    const dayId = task.taskDate;
    if (!dayId) continue;
    const stats = statsByDay.get(dayId) || { done: 0, total: 0 };
    stats.total += 1;
    if (task.completed) stats.done += 1;
    statsByDay.set(dayId, stats);
  }

  const days = Array.from({ length: count }, (_, index) => {
    const day = addDays(today, index - count + 1);
    const dayId = isoDate(day);
    const stats = statsByDay.get(dayId) || { done: 0, total: 0 };
    done += stats.done;
    total += stats.total;
    return { day, dayId, done: stats.done, total: stats.total };
  });

  return { days, done, total };
}

function renderRecentCompletion(container, completion) {
  const bars = completion.days.map((day) => {
    const rate = day.total ? Math.round((day.done / day.total) * 100) : 0;
    const title = `${day.dayId} - ${day.done} completed / ${day.total} total (${rate}%)`;
    const empty = day.total ? '' : ' empty';
    return `
      <div class="completion-bar${empty}" title="${escapeHtml(title)}">
        <span style="--completion: ${rate}%"></span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="completion-chart">
      <div class="completion-axis">
        <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
      </div>
      <div class="completion-plot">
        <div class="completion-guides"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="completion-bars">${bars}</div>
      </div>
      <div class="completion-xaxis"><span>-29D</span><span>TODAY</span></div>
    </div>
  `;
}

function smoothClosedPath(points) {
  if (!points.length) return '';
  const first = midpoint(points.at(-1), points[0]);
  const commands = [`M ${formatPoint(first)}`];
  points.forEach((point, index) => {
    const next = midpoint(point, points[(index + 1) % points.length]);
    commands.push(`Q ${formatPoint(point)} ${formatPoint(next)}`);
  });
  commands.push('Z');
  return commands.join(' ');
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function formatPoint(point) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function normalizeFixedArray(value, length) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => Number(source[index] || 0));
}

function formatBinLabel(index) {
  const minutes = index * CLOCK_BIN_MINUTES;
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function parseDateId(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}