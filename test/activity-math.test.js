'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let activeSecondsForInterval;

test.before(async () => {
  ({ activeSecondsForInterval } = await import('../web/activityMath.mjs'));
});

test('active interval stays fully counted while input remains recent', () => {
  assert.equal(activeSecondsForInterval(30, 5, 10), 30);
});

test('long-idle interval counts only time after a new input', () => {
  assert.equal(activeSecondsForInterval(30, 120, 5), 5);
});

test('idle threshold crossing counts only the remaining grace period', () => {
  assert.equal(activeSecondsForInterval(30, 45, 75), 15);
  assert.equal(activeSecondsForInterval(30, 75, 105), 0);
});

test('first sample is active only when the system is below the threshold', () => {
  assert.equal(activeSecondsForInterval(30, null, 10), 30);
  assert.equal(activeSecondsForInterval(30, null, 90), 0);
});
