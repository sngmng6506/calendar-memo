'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  createSyncServer,
  ensureSchema,
  hashKey
} = require('../server/sync-server');

const databaseUrl = process.env.TEST_DATABASE_URL || '';

test('PostgreSQL sync preserves ordered cursors across two clients and concurrent writes', {
  skip: !databaseUrl
}, async (t) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl });
  const pepper = crypto.randomBytes(32).toString('hex');
  const syncKey = crypto.randomBytes(32).toString('hex');
  const accountHash = hashKey(syncKey, pepper);

  await ensureSchema(pool);
  const { server } = createSyncServer({
    pool,
    syncPepper: pepper,
    maxDownloadRecords: 2,
    rateLimit: 1000
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.query('delete from sync_records where account_hash = $1', [accountHash]);
    await pool.end();
  });

  async function sync(cursor, records = []) {
    const response = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ syncKey, cursor, records })
    });
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    assert.equal(body.ok, true);
    return body;
  }

  const taskA = {
    collection: 'tasks',
    recordId: 'task-a',
    updatedAt: '2026-07-28T01:00:00.000Z',
    payload: { id: 'task-a', content: 'A', updatedAt: '2026-07-28T01:00:00.000Z' }
  };
  const first = await sync('0', [taskA]);
  assert.match(first.cursor, /^\d+$/);
  assert.equal(first.records.some((record) => record.recordId === 'task-a'), true);

  const secondClient = await sync('0');
  assert.equal(secondClient.records.some((record) => record.recordId === 'task-a'), true);

  const taskB = {
    collection: 'tasks',
    recordId: 'task-b',
    updatedAt: '2026-07-28T01:01:00.000Z',
    payload: { id: 'task-b', content: 'B', updatedAt: '2026-07-28T01:01:00.000Z' }
  };
  const taskC = {
    collection: 'tasks',
    recordId: 'task-c',
    updatedAt: '2026-07-28T01:02:00.000Z',
    payload: { id: 'task-c', content: 'C', updatedAt: '2026-07-28T01:02:00.000Z' }
  };

  await Promise.all([
    sync(first.cursor, [taskB]),
    sync(first.cursor, [taskC])
  ]);

  let cursor = first.cursor;
  const seen = new Set();
  let hasMore = true;
  while (hasMore) {
    const page = await sync(cursor);
    for (const record of page.records) seen.add(record.recordId);
    assert.notEqual(page.cursor, cursor, 'a non-empty page must advance its cursor');
    cursor = page.cursor;
    hasMore = page.hasMore;
  }

  assert.equal(seen.has('task-b'), true);
  assert.equal(seen.has('task-c'), true);
});
