'use strict';

const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_PEPPER = process.env.SYNC_PEPPER || '';
const MAX_BODY_BYTES = 5_000_000;
const MAX_RECORDS = 5000;
const MAX_RECORD_BYTES = 256_000;
const MIN_SYNC_KEY_LENGTH = 32;
const ALLOWED_COLLECTIONS = new Set(['tasks', 'signals', 'reports', 'analytics.days']);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Number(process.env.SYNC_RATE_LIMIT || 60);
const rateBuckets = new Map();

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (SYNC_PEPPER.length < 32) {
  console.error('SYNC_PEPPER must be at least 32 characters');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

async function ensureSchema() {
  await pool.query(`
    create table if not exists sync_records (
      account_hash text not null,
      collection text not null,
      record_id text not null,
      payload jsonb,
      record_updated_at timestamptz not null,
      deleted_at timestamptz,
      server_updated_at timestamptz not null default now(),
      primary key (account_hash, collection, record_id)
    );
    create index if not exists sync_records_account_updated_idx
      on sync_records (account_hash, server_updated_at asc);
  `);
}

function hashKey(syncKey) {
  return crypto.createHmac('sha256', SYNC_PEPPER).update(String(syncKey || '')).digest('hex');
}

function sendJson(res, status, body) {
  const text = status === 204 ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function allowRequest(req) {
  const key = clientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        const error = new Error('request too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error('invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeRecord(record) {
  if (!record || !ALLOWED_COLLECTIONS.has(record.collection)) return null;
  if (typeof record.recordId !== 'string' || !record.recordId || record.recordId.length > 200) return null;
  if (!validIso(record.updatedAt)) return null;
  if (record.deletedAt && !validIso(record.deletedAt)) return null;
  if (!record.deletedAt && (record.payload == null || Buffer.byteLength(JSON.stringify(record.payload), 'utf8') > MAX_RECORD_BYTES)) return null;
  return {
    collection: record.collection,
    record_id: record.recordId,
    payload: record.deletedAt ? null : record.payload,
    record_updated_at: record.updatedAt,
    deleted_at: record.deletedAt || null
  };
}

function normalizeCursor(value) {
  if (!value) return new Date(0).toISOString();
  if (!validIso(value)) {
    const error = new Error('invalid sync cursor');
    error.statusCode = 400;
    throw error;
  }
  return new Date(value).toISOString();
}

async function upsertRecords(client, accountHash, records) {
  if (!records.length) return;
  await client.query(`
    with incoming as (
      select *
      from jsonb_to_recordset($2::jsonb) as x(
        collection text,
        record_id text,
        payload jsonb,
        record_updated_at timestamptz,
        deleted_at timestamptz
      )
    )
    insert into sync_records (
      account_hash,
      collection,
      record_id,
      payload,
      record_updated_at,
      deleted_at,
      server_updated_at
    )
    select $1, collection, record_id, payload, record_updated_at, deleted_at, now()
    from incoming
    on conflict (account_hash, collection, record_id) do update set
      payload = excluded.payload,
      record_updated_at = excluded.record_updated_at,
      deleted_at = excluded.deleted_at,
      server_updated_at = now()
    where sync_records.record_updated_at <= excluded.record_updated_at
  `, [accountHash, JSON.stringify(records)]);
}

async function handleSync(req, res) {
  if (!allowRequest(req)) {
    sendJson(res, 429, { ok: false, error: 'too many sync requests' });
    return;
  }

  const body = await readBody(req);
  const syncKey = String(body.syncKey || '').trim();
  if (syncKey.length < MIN_SYNC_KEY_LENGTH) {
    sendJson(res, 400, { ok: false, error: `syncKey must be at least ${MIN_SYNC_KEY_LENGTH} characters` });
    return;
  }

  const cursor = normalizeCursor(body.cursor);
  const sourceRecords = Array.isArray(body.records) ? body.records.slice(0, MAX_RECORDS) : [];
  const records = sourceRecords.map(normalizeRecord).filter(Boolean);
  if (records.length !== sourceRecords.length) {
    sendJson(res, 400, { ok: false, error: 'one or more sync records are invalid' });
    return;
  }

  const accountHash = hashKey(syncKey);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const cursorResult = await client.query('select now() as cursor');
    const nextCursor = cursorResult.rows[0].cursor;
    await upsertRecords(client, accountHash, records);
    const result = await client.query(`
      select collection, record_id, payload, record_updated_at, deleted_at
      from sync_records
      where account_hash = $1
        and server_updated_at > $2::timestamptz
        and server_updated_at <= $3::timestamptz
      order by server_updated_at asc, collection asc, record_id asc
    `, [accountHash, cursor, nextCursor]);
    await client.query('commit');

    sendJson(res, 200, {
      ok: true,
      cursor: nextCursor.toISOString(),
      syncedAt: nextCursor.toISOString(),
      accepted: records.length,
      records: result.rows.map((row) => ({
        collection: row.collection,
        recordId: row.record_id,
        payload: row.payload,
        updatedAt: row.record_updated_at.toISOString(),
        deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null
      }))
    });
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/sync') {
      await handleSync(req, res);
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message || 'sync failed' });
  }
});

ensureSchema().then(() => {
  server.listen(PORT, () => console.log(`daymark sync server listening on ${PORT}`));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
