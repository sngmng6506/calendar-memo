const test = require("node:test");
const assert = require("node:assert/strict");
const BoardCalendar = require("../core/holiday-calendar");
const BoardMetrics = require("../core/board-metrics");
const { loadHolidayScripts } = require("../core/load-holidays-node");

loadHolidayScripts();

function boardWith(tasks, energy = {}) {
  return { tasks, energy, taskOrderMode: "due" };
}

test("회사 업무는 평일에만 자동 업무로 잡히며 공휴일은 제외한다", () => {
  const board = boardWith([
    { id: "company-work", name: "회사 업무", fixed: true, hours: 6, entries: {} },
  ]);

  assert.equal(BoardMetrics.getTodaySummary(board, "2026-03-02").workload, 0);
  assert.equal(BoardMetrics.getTodaySummary(board, "2026-03-03").workload, 50);
  assert.equal(BoardMetrics.getTodaySummary(board, "2026-03-07").workload, 0);
});

test("공휴일에도 명시적 회사 업무 기록이 있으면 표시한다", () => {
  const board = boardWith([
    {
      id: "company-work",
      name: "회사 업무",
      fixed: true,
      hours: 6,
      entries: { "2026-03-02": { workload: 30, note: "긴급 대응" } },
    },
  ]);

  const summary = BoardMetrics.getTodaySummary(board, "2026-03-02");
  assert.equal(summary.workload, 30);
  assert.equal(summary.items.length, 1);
});

test("정기 일정은 설정한 시작일과 종료일 안에서만 생성한다", () => {
  const recurring = {
    id: "swim",
    name: "수영",
    start: "2026-07-01",
    end: "2026-07-31",
    hours: 1,
    recurring: { frequency: "weekly", weekdays: [6] },
    entries: {},
  };

  assert.equal(BoardMetrics.hasTaskWorkOn(recurring, "2026-06-27"), false);
  assert.equal(BoardMetrics.hasTaskWorkOn(recurring, "2026-07-04"), true);
  assert.equal(BoardMetrics.hasTaskWorkOn(recurring, "2026-08-01"), false);
});

test("회사 프로젝트는 타임라인 항목에는 나타나지만 전체 업무량에는 중복 합산하지 않는다", () => {
  const board = boardWith([
    { id: "company-work", name: "회사 업무", fixed: true, hours: 6, entries: {} },
    {
      id: "project-a",
      name: "프로젝트 A",
      companyProject: true,
      start: "2026-07-01",
      end: "2026-07-31",
      entries: { "2026-07-13": { note: "설계 검토" } },
    },
  ]);

  const summary = BoardMetrics.getTodaySummary(board, "2026-07-13");
  assert.equal(summary.workload, 50);
  assert.equal(summary.items.length, 2);
  assert.equal(summary.items.find((item) => item.id === "project-a").includedInTotal, false);
});

test("컨디션 실제값은 보간값보다 우선한다", () => {
  const board = boardWith([], { "2026-07-13": 74 });
  assert.deepEqual(BoardMetrics.getEnergyForDate(board, "2026-07-13"), {
    value: 74,
    type: "actual",
  });
});
