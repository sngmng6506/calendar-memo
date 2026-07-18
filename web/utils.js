export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseIso(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function monthMatrix(monthDate) {
  const first = startOfMonth(monthDate);
  // Weeks start on Saturday (SAT SUN MON ... FRI) so the light weekend columns
  // sit on the left, where desktop icons usually crowd the screen.
  const saturdayIndex = (first.getDay() + 1) % 7;
  const start = addDays(first, -saturdayIndex);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${pad2(minutes)}m`;
  return `${minutes}m`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}