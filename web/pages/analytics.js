import { formatDuration, isoDate, pad2 } from '../utils.js';

export function renderAnalyticsPage({ mount, analyticsDay }) {
  const today = isoDate(new Date());
  const todayAnalytics = analyticsDay(today);
  const activeToday = todayAnalytics.activeSeconds || 0;
  const hours = Array.from({ length: 24 }, (_, index) => Number(todayAnalytics.hours?.[index] || 0));

  const page = document.createElement('section');
  page.className = 'analytics-page analytics-quadrants';
  page.innerHTML = `
    <section class="analytics-panel active-clock-panel">
      <div class="analytics-panel-head"><span>ACTIVE CLOCK</span><strong>${formatDuration(activeToday)}</strong></div>
      <div class="active-clock" data-active-clock></div>
    </section>
    <section class="analytics-panel empty-panel"><div class="analytics-panel-head"><span>EMPTY</span><strong>02</strong></div></section>
    <section class="analytics-panel empty-panel"><div class="analytics-panel-head"><span>EMPTY</span><strong>03</strong></div></section>
    <section class="analytics-panel empty-panel"><div class="analytics-panel-head"><span>EMPTY</span><strong>04</strong></div></section>
  `;
  mount.appendChild(page);
  renderActiveClock(page.querySelector('[data-active-clock]'), hours, activeToday);
}

export function renderActiveClock(container, hours, activeSeconds = 0) {
  const size = 340;
  const center = size / 2;
  const max = Math.max(...hours);
  const total = Number(activeSeconds || 0);
  let S = 0;
  let C = 0;
  let W = 0;

  hours.forEach((seconds, hour) => {
    const t = ((hour + 0.5) / 24) * 2 * Math.PI;
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

  const rings = hours.map((seconds, hour) => {
    const angle = ((hour / 24) * Math.PI * 2) - Math.PI / 2;
    const ratio = max ? seconds / max : 0;
    const inner = 96;
    const length = 20 + Math.round(ratio * 42);
    const x1 = center + Math.cos(angle) * inner;
    const y1 = center + Math.sin(angle) * inner;
    const x2 = center + Math.cos(angle) * (inner + length);
    const y2 = center + Math.sin(angle) * (inner + length);
    const density = ratio === 0 ? 'd0' : ratio <= 0.25 ? 'd1' : ratio <= 0.5 ? 'd2' : ratio <= 0.75 ? 'd3' : 'd4';
    return `<line class="clock-hour ${density}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"><title>${pad2(hour)}:00 ${formatDuration(seconds)}</title></line>`;
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
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Active time by hour">
      <circle class="clock-ring" cx="${center}" cy="${center}" r="90"></circle>
      <circle class="clock-center" cx="${center}" cy="${center}" r="48"></circle>
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
  store.analytics.days[dayId] ||= { activeSeconds: 0, hours: Array.from({ length: 24 }, () => 0) };
  store.analytics.days[dayId].hours ||= Array.from({ length: 24 }, () => 0);
  return store.analytics.days[dayId];
}

export async function recordActiveTime({ state, persist, renderAll }) {
  const now = Date.now();
  const previous = state.lastActiveTick || now;
  const delta = Math.max(0, Math.min(120, Math.round((now - previous) / 1000)));
  state.lastActiveTick = now;
  if (!delta) return;
  const day = analyticsDay(state.store, isoDate(new Date()));
  day.activeSeconds = (day.activeSeconds || 0) + delta;
  day.hours[new Date().getHours()] += delta;
  day.lastSeenAt = new Date().toISOString();
  await persist();
  if (state.page === 'analytics') renderAll();
}