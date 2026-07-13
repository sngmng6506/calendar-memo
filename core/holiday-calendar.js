(function initHolidayCalendar(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BoardCalendar = api;
  // holidays/<year>.js files call this global function. Do not overwrite an
  // existing app-specific loader, but provide it for widget/desktop clients.
  if (typeof root.registerHolidays !== "function") root.registerHolidays = api.registerHolidays;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHolidayCalendar() {
  const fixedKoreanHolidays = {
    "01-01": "신정",
    "03-01": "삼일절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "12-25": "성탄절",
  };

  const holidayMaps = new Map();

  function registerHolidays(year, map) {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || !map || typeof map !== "object") return;
    holidayMaps.set(numericYear, { ...map });
  }

  function getHolidayName(date) {
    if (!isDateKey(date)) return "";
    const yearMap = holidayMaps.get(Number(date.slice(0, 4)));
    if (yearMap && yearMap[date]) return yearMap[date];
    return fixedKoreanHolidays[date.slice(5)] || "";
  }

  function isHoliday(date) {
    return Boolean(getHolidayName(date));
  }

  function isWeekend(date) {
    if (!isDateKey(date)) return false;
    const day = new Date(`${date}T00:00:00`).getDay();
    return day === 0 || day === 6;
  }

  function isWorkday(date) {
    return isDateKey(date) && !isWeekend(date) && !isHoliday(date);
  }

  function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return {
    fixedKoreanHolidays,
    registerHolidays,
    getHolidayName,
    isHoliday,
    isWeekend,
    isWorkday,
    isDateKey,
  };
});
