'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  markRecordsSynced,
  mergeStoreSnapshots,
  mergeSyncRecords,
  normalizeStore,
  pruneDeleted,
  syncRecordsFromStore
} = require('../electron/data-model');

function store(overrides = {}) {
  return normalizeStore({
    tasks: [],
    signals: [],
    analytics: { days: {} },
    reports: [],
    deleted: [],
    settings: {},
    meta: {},
    ...overrides
  });
}

test('a stale remote deletion cannot remove a newer local task', () => {
  const local = store({ tasks: [{ id: 'task-1', content: 'new', updatedAt: '2026-07-20T10:00:00.000Z' }] });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks', recordId: 'task-1', updatedAt: '2026-07-20T09:00:00.000Z', deletedAt: '2026-07-20T09:00:00.000Z'
  }]);
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].content, 'new');
  assert.equal(merged.deleted.length, 0);
});

test('a newer remote deletion removes an older local task', () => {
  const local = store({ tasks: [{ id: 'task-1', content: 'old', updatedAt: '2026-07-20T09:00:00.000Z' }] });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks', recordId: 'task-1', updatedAt: '2026-07-20T10:00:00.000Z', deletedAt: '2026-07-20T10:00:00.000Z'
  }], { syncedAt: '2026-07-20T10:01:00.000Z' });
  assert.equal(merged.tasks.length, 0);
  assert.equal(merged.deleted[0].syncedAt, '2026-07-20T10:01:00.000Z');
});

test('a newer payload revives a record deleted by an older tombstone', () => {
  const local = store({ deleted: [{ collection: 'tasks', recordId: 'task-1', deletedAt: '2026-07-20T09:00:00.000Z' }] });
  const merged = mergeSyncRecords(local, [{
    collection: 'tasks', recordId: 'task-1', updatedAt: '2026-07-20T10:00:00.000Z',
    payload: { id: 'task-1', content: 'restored', updatedAt: '2026-07-20T10:00:00.000Z' }
  }]);
  assert.equal(merged.tasks[0].content, 'restored');
  assert.equal(merged.deleted.length, 0);
});

test('upload selection is independent of server cursor and local clock skew', () => {
  const value = store({
    tasks: [{ id: 'slow-clock', content: 'local change', updatedAt: '2020-01-01T00:00:00.000Z' }],
    settings: { syncCursor: '999999' }
  });
  assert.deepEqual(syncRecordsFromStore(value).map((item) => item.recordId), ['slow-clock']);
});

test('acknowledged records stay clean until payload changes, even with the same timestamp', () => {
  const value = store({ tasks: [{ id: 'task-1', content: 'A', updatedAt: '2026-07-20T10:00:00.000Z' }] });
  const outgoing = syncRecordsFromStore(value);
  markRecordsSynced(value, outgoing);
  assert.equal(syncRecordsFromStore(value).length, 0);

  value.tasks[0].content = 'B';
  assert.deepEqual(syncRecordsFromStore(value).map((item) => item.recordId), ['task-1']);
});

test('newer sync acknowledgement metadata survives stale renderer snapshots', () => {
  const current = store({ tasks: [{ id: 'task-1', content: 'A', updatedAt: '2026-07-20T10:00:00.000Z' }] });
  markRecordsSynced(current, syncRecordsFromStore(current));
  const stale = store({ tasks: [{ id: 'task-1', content: 'A', updatedAt: '2026-07-20T10:00:00.000Z' }] });
  const merged = mergeStoreSnapshots(current, stale);
  assert.equal(syncRecordsFromStore(merged).length, 0);
});

test('only acknowledged tombstones older than retention are pruned and their ack entries are cleaned', () => {
  const value = store({
    deleted: [
      { collection: 'tasks', recordId: 'old-synced', deletedAt: '2026-05-01T00:00:00.000Z', syncedAt: '2026-05-01T00:01:00.000Z' },
      { collection: 'tasks', recordId: 'old-unsynced', deletedAt: '2026-05-01T00:00:00.000Z' },
      { collection: 'tasks', recordId: 'recent', deletedAt: '2026-07-19T00:00:00.000Z', syncedAt: '2026-07-19T00:01:00.000Z' }
    ]
  });
  markRecordsSynced(value, syncRecordsFromStore(value));
  pruneDeleted(value, { now: Date.parse('2026-07-20T00:00:00.000Z') });
  assert.deepEqual(value.deleted.map((item) => item.recordId).sort(), ['old-unsynced', 'recent']);
  assert.equal(Object.hasOwn(value.meta.syncAck, 'tasks:old-synced'), false);
});
