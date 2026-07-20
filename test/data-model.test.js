'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeSyncRecords,
  pruneDeleted,
  syncRecordsFromStore
} = require('../electron/data-model');

function store(overrides = {}) {
  return {
    tasks: [],
    signals: [],
    analytics: { days: {} },
    reports: [],
    deleted: [],
    settings: {},
    ...overrides
  };
}

test('a stale remote deletion cannot remove a newer local task', () => {
  const local = store({
    tasks: [{ id: 'task-1', content: 'new', updatedAt: '2026-07-20T10:00:00.000Z' }]
  });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks',
    recordId: 'task-1',
    updatedAt: '2026-07-20T09:00:00.000Z',
    deletedAt: '2026-07-20T09:00:00.000Z'
  }]);
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].content, 'new');
  assert.equal(merged.deleted.length, 0);
});

test('a newer remote deletion removes an older local task', () => {
  const local = store({
    tasks: [{ id: 'task-1', content: 'old', updatedAt: '2026-07-20T09:00:00.000Z' }]
  });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks',
    recordId: 'task-1',
    updatedAt: '2026-07-20T10:00:00.000Z',
    deletedAt: '2026-07-20T10:00:00.000Z'
  }], { syncedAt: '2026-07-20T10:01:00.000Z' });
  assert.equal(merged.tasks.length, 0);
  assert.equal(merged.deleted[0].syncedAt, '2026-07-20T10:01:00.000Z');
});

test('a newer payload revives a record deleted by an older tombstone', () => {
  const local = store({
    deleted: [{ collection: 'tasks', recordId: 'task-1', deletedAt: '2026-07-20T09:00:00.000Z' }]
  });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks',
    recordId: 'task-1',
    updatedAt: '2026-07-20T10:00:00.000Z',
    payload: { id: 'task-1', content: 'restored', updatedAt: '2026-07-20T10:00:00.000Z' }
  }]);
  assert.equal(merged.tasks[0].content, 'restored');
  assert.equal(merged.deleted.length, 0);
});

test('incremental records include unsynced tombstones and changes after the cursor', () => {
  const value = store({
    tasks: [
      { id: 'old', updatedAt: '2026-07-19T00:00:00.000Z' },
      { id: 'new', updatedAt: '2026-07-20T12:00:00.000Z' }
    ],
    deleted: [
      { collection: 'tasks', recordId: 'gone', deletedAt: '2026-07-19T00:00:00.000Z' }
    ]
  });
  const records = syncRecordsFromStore(value, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(records.map((item) => item.recordId).sort(), ['gone', 'new']);
});

test('only acknowledged tombstones older than retention are pruned', () => {
  const value = store({
    deleted: [
      { collection: 'tasks', recordId: 'old-synced', deletedAt: '2026-05-01T00:00:00.000Z', syncedAt: '2026-05-01T00:01:00.000Z' },
      { collection: 'tasks', recordId: 'old-unsynced', deletedAt: '2026-05-01T00:00:00.000Z' },
      { collection: 'tasks', recordId: 'recent', deletedAt: '2026-07-19T00:00:00.000Z', syncedAt: '2026-07-19T00:01:00.000Z' }
    ]
  });
  pruneDeleted(value, { now: Date.parse('2026-07-20T00:00:00.000Z') });
  assert.deepEqual(value.deleted.map((item) => item.recordId).sort(), ['old-unsynced', 'recent']);
});
