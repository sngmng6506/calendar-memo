'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncService, syncEndpoint } = require('../electron/sync');
const { normalizeStore } = require('../electron/data-model');

function makeStore(tasks, settings = {}) {
  return normalizeStore({
    tasks,
    signals: [],
    analytics: { days: {} },
    reports: [],
    deleted: [],
    settings: { syncKey: 'x'.repeat(32), ...settings },
    meta: {}
  });
}

test('sync endpoint rejects insecure remote HTTP URLs', () => {
  assert.match(syncEndpoint({ syncUrl: 'http://example.com' }).error, /HTTPS/);
  assert.equal(syncEndpoint({ syncUrl: 'http://localhost:3000' }).endpoint, 'http://localhost:3000/api/sync');
  assert.equal(syncEndpoint({ syncUrl: 'https://example.com/base/' }).endpoint, 'https://example.com/base/api/sync');
});

test('sync chunks all pending uploads and acknowledges echoed authoritative records', async () => {
  const requests = [];
  let cursor = 0;
  const service = createSyncService({
    syncUrl: 'https://example.com',
    maxUploadRecords: 2,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);
      cursor += request.records.length;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          cursor: String(cursor),
          syncedAt: '2026-07-20T11:00:00.000Z',
          hasMore: false,
          records: request.records
        })
      };
    },
    saveStore: async (value) => value,
    now: () => new Date('2026-07-20T11:00:00.000Z')
  });

  const tasks = Array.from({ length: 5 }, (_, index) => ({
    id: `task-${index}`,
    content: `Task ${index}`,
    updatedAt: '2026-07-20T10:00:00.000Z'
  }));
  const result = await service.sync(makeStore(tasks));

  assert.equal(result.success, true);
  assert.deepEqual(requests.map((request) => request.records.length), [2, 2, 1]);
  assert.equal(result.uploadedCount, 5);
  assert.equal(result.store.settings.syncCursor, '5');
  assert.equal(Object.keys(result.store.meta.syncAck).length, 5);
});

test('sync also chunks uploads by serialized byte size', async () => {
  const requestSizes = [];
  const service = createSyncService({
    syncUrl: 'https://example.com',
    maxUploadRecords: 100,
    maxUploadBytes: 500,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      requestSizes.push(request.records.length);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          cursor: String(requestSizes.length),
          syncedAt: '2026-07-20T11:00:00.000Z',
          hasMore: false,
          records: request.records
        })
      };
    },
    saveStore: async (value) => value
  });
  const tasks = Array.from({ length: 4 }, (_, index) => ({
    id: `large-${index}`,
    content: 'x'.repeat(220),
    updatedAt: `2026-07-20T10:00:0${index}.000Z`
  }));
  const result = await service.sync(makeStore(tasks));
  assert.equal(result.success, true);
  assert.equal(requestSizes.length > 1, true);
  assert.equal(requestSizes.reduce((sum, size) => sum + size, 0), 4);
});

test('sync continues downloading pages after uploads are exhausted', async () => {
  const requests = [];
  const pages = [
    { cursor: '1', hasMore: true, records: [{ collection: 'tasks', recordId: 'remote-1', updatedAt: '2026-07-20T10:00:00.000Z', payload: { id: 'remote-1', content: 'one', updatedAt: '2026-07-20T10:00:00.000Z' } }] },
    { cursor: '2', hasMore: false, records: [{ collection: 'tasks', recordId: 'remote-2', updatedAt: '2026-07-20T10:01:00.000Z', payload: { id: 'remote-2', content: 'two', updatedAt: '2026-07-20T10:01:00.000Z' } }] }
  ];
  const service = createSyncService({
    syncUrl: 'https://example.com',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const page = pages.shift();
      return { ok: true, status: 200, json: async () => ({ ok: true, syncedAt: '2026-07-20T11:00:00.000Z', ...page }) };
    },
    saveStore: async (value) => value
  });

  const empty = makeStore([], { syncCursor: '0' });
  const result = await service.sync(empty);
  assert.equal(result.success, true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.records.length), [0, 0]);
  assert.deepEqual(result.store.tasks.map((task) => task.id).sort(), ['remote-1', 'remote-2']);
  assert.equal(result.store.settings.syncCursor, '2');
});

test('partial progress and cursor are saved when a later transfer fails', async () => {
  let call = 0;
  const saved = [];
  const service = createSyncService({
    syncUrl: 'https://example.com',
    maxUploadRecords: 1,
    fetchImpl: async (_url, options) => {
      call += 1;
      const request = JSON.parse(options.body);
      if (call === 2) throw new Error('offline');
      return { ok: true, status: 200, json: async () => ({ ok: true, cursor: '1', syncedAt: '2026-07-20T11:00:00.000Z', hasMore: false, records: request.records }) };
    },
    saveStore: async (value) => {
      saved.push(structuredClone(value));
      return value;
    }
  });

  const result = await service.sync(makeStore([
    { id: 'a', content: 'A', updatedAt: '2026-07-20T10:00:00.000Z' },
    { id: 'b', content: 'B', updatedAt: '2026-07-20T10:00:01.000Z' }
  ]));
  assert.equal(result.success, false);
  assert.equal(result.uploadedCount, 1);
  assert.equal(saved.at(-1).settings.syncCursor, '1');
  assert.match(saved.at(-1).settings.lastSyncError, /offline/);
});
