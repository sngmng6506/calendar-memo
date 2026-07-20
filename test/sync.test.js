'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncService, syncEndpoint } = require('../electron/sync');

test('sync endpoint rejects insecure remote HTTP URLs', () => {
  assert.match(syncEndpoint({ syncUrl: 'http://example.com' }).error, /HTTPS/);
  assert.equal(syncEndpoint({ syncUrl: 'http://localhost:3000' }).endpoint, 'http://localhost:3000/api/sync');
  assert.equal(syncEndpoint({ syncUrl: 'https://example.com/base/' }).endpoint, 'https://example.com/base/api/sync');
});

test('app-owned sync endpoint works without a user URL setting', () => {
  assert.equal(syncEndpoint({}, 'https://sync.example.com').endpoint, 'https://sync.example.com/api/sync');
  assert.equal(syncEndpoint({ syncUrl: 'https://legacy.example.com' }, 'https://sync.example.com').endpoint, 'https://sync.example.com/api/sync');
});

test('sync sends a cursor, merges returned records and advances the cursor', async () => {
  let requestBody;
  let requestUrl;
  const service = createSyncService({
    syncUrl: 'https://example.com',
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          cursor: '2026-07-20T11:00:00.000Z',
          syncedAt: '2026-07-20T11:00:00.000Z',
          records: [{
            collection: 'tasks',
            recordId: 'remote',
            updatedAt: '2026-07-20T10:30:00.000Z',
            payload: { id: 'remote', content: 'remote task', updatedAt: '2026-07-20T10:30:00.000Z' }
          }]
        })
      };
    },
    saveStore: async (value) => value,
    now: () => new Date('2026-07-20T11:00:00.000Z')
  });

  const result = await service.sync({
    tasks: [{ id: 'local', content: 'local task', updatedAt: '2026-07-20T10:15:00.000Z' }],
    signals: [],
    analytics: { days: {} },
    reports: [],
    deleted: [],
    settings: {
      syncKey: 'x'.repeat(32),
      syncCursor: '2026-07-20T10:00:00.000Z'
    }
  });

  assert.equal(requestUrl, 'https://example.com/api/sync');
  assert.equal(requestBody.cursor, '2026-07-20T10:00:00.000Z');
  assert.deepEqual(requestBody.records.map((record) => record.recordId), ['local']);
  assert.deepEqual(result.store.tasks.map((task) => task.id).sort(), ['local', 'remote']);
  assert.equal(result.store.settings.syncCursor, '2026-07-20T11:00:00.000Z');
  assert.equal(result.uploadedCount, 1);
  assert.equal(result.downloadedCount, 1);
});
