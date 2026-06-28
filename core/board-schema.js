(function initBoardSchema(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BoardSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBoardSchema() {
  const SCHEMA_VERSION = 1;
  const COMPANY_WORK_ID = "company-work";

  function normalizeBoard(board) {
    const normalized = board && typeof board === "object" ? board : {};
    if (!Array.isArray(normalized.tasks)) normalized.tasks = [];
    if (!normalized.energy || typeof normalized.energy !== "object") normalized.energy = {};
    if (!normalized.taskOrderMode) normalized.taskOrderMode = "due";
    ensureCompanyWorkTask(normalized);
    if (normalized.taskOrderMode !== "manual") sortTasksByDueDate(normalized.tasks);
    normalized.schemaVersion = SCHEMA_VERSION;
    return normalized;
  }

  function ensureCompanyWorkTask(board) {
    if (!Array.isArray(board.tasks)) board.tasks = [];
    let task = board.tasks.find((item) => item.fixed || item.id === COMPANY_WORK_ID);
    if (!task) {
      task = {
        id: COMPANY_WORK_ID,
        name: "회사 업무",
        fixed: true,
        start: "0001-01-01",
        end: "9999-12-31",
        weight: null,
        entries: {},
      };
    } else {
      task.id = COMPANY_WORK_ID;
      task.fixed = true;
      if (!task.entries || typeof task.entries !== "object") task.entries = {};
    }
    board.tasks = [task, ...board.tasks.filter((item) => item !== task)];
    return task;
  }

  function sortTasksByDueDate(tasks) {
    if (!Array.isArray(tasks)) return [];
    tasks.sort((a, b) => {
      if (Boolean(a.fixed) !== Boolean(b.fixed)) return a.fixed ? -1 : 1;
      if (Boolean(a.companyProject) !== Boolean(b.companyProject)) return a.companyProject ? -1 : 1;
      const dueDiff = dateTime(a.end) - dateTime(b.end);
      if (dueDiff !== 0) return dueDiff;
      return dateTime(a.start) - dateTime(b.start);
    });
    return tasks;
  }

  function isLegacySample(board) {
    if (!board || !Array.isArray(board.tasks)) return false;
    const names = board.tasks.map((task) => task.name).sort().join(",");
    return names === "MVP 기능 구현,콘텐츠 정리";
  }

  function dateTime(value) {
    const time = new Date(value || "9999-12-31").getTime();
    return Number.isFinite(time) ? time : new Date("9999-12-31").getTime();
  }

  return {
    SCHEMA_VERSION,
    COMPANY_WORK_ID,
    normalizeBoard,
    ensureCompanyWorkTask,
    sortTasksByDueDate,
    isLegacySample,
  };
});

