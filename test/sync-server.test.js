'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRateLimiter,
  createSyncServer,
  normalizeCursor,
  normalizeRecord,
  recordTieBreaker
} = require('../server/sync-server');

test('legacy timestamp cursors migrate to the numeric cursor origin', () => {
  assert.equal(normalizeCursor('2026-07-20T10:00:00.000Z'), '0');
  assert.equal(normalizeCursor('00042'), '42');
  assert.equal(normalizeCursor(null), '0');
  assert.throws(() => normalizeCursor('not-a-cursor'), /invalid sync cursor/);
});

test('payload IDs must match their record IDs', () => {
  assert.equal(normalizeRecord({
    collection: 'tasks',
    recordId: 'task-1',
    updatedAt: '2026-07-20T10:00:00.000Z',
    payload: { id: 'other', updatedAt: '2026-07-20T10:00:00.000Z' }
  }), null);
});

test('equal timestamps use deterministic payload ordering and deletion wins', () => {
  const smaller = { payload: { id: 'task-1', content: 'A' } };
  const larger = { payload: { id: 'task-1', content: 'B' } };
  assert.equal(recordTieBreaker(smaller) < recordTieBreaker(larger), true);
  assert.equal(recordTieBreaker(larger) < recordTieBreaker({ deletedAt: '2026-07-20T10:00:00.000Z' }), true);
});

test('rate limiter removes expired buckets', () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 100, limit: 1, now: () => now });
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), false);
  now = 101;
  limiter.cleanup();
  assert.equal(limiter.size(), 0);
  assert.equal(limiter.allow('a'), true);
});

test('server rejects oversized record batches instead of silently truncating them', async (t) => {
  const pool = { connect: async () => { throw new Error('database should not be reached'); } };
  const { server } = createSyncServer({ pool, syncPepper: 'p'.repeat(32), maxRecords: 2 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const records = Array.from({ length: 3 }, (_, index) => ({
    collection: 'tasks',
    recordId: `task-${index}`,
    updatedAt: '2026-07-20T10:00:00.000Z',
    payload: { id: `task-${index}`, updatedAt: '2026-07-20T10:00:00.000Z' }
  }));
  const response = await fetch(`http://127.0.0.1:${port}/api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ syncKey: 'x'.repeat(32), cursor: '0', records })
  });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /at most 2/);
});
