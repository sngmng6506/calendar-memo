'use strict';

const http = require('http');
const crypto = require('crypto');

const DEFAULT_MAX_BODY_BYTES = 5_000_000;
const DEFAULT_MAX_RECORDS = 5000;
const DEFAULT_MAX_RECORD_BYTES = 256_000;
const DEFAULT_MAX_DOWNLOAD_RECORDS = 10;
const MIN_SYNC_KEY_LENGTH = 32;
const ALLOWED_COLLECTIONS = new Set(['tasks', 'signals', 'reports', 'analytics.days']);
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 60;

function stableJson(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function recordTieBreaker(record) {
  return record.deletedAt ? '\uffff' : stableJson(record.payload);
}

function hashKey(syncKey, pepper) {
  return crypto.createHmac('sha256', pepper).update(String(syncKey || '')).digest('hex');
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

function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || DEFAULT_RATE_WINDOW_MS);
  const limit = Number(options.limit || DEFAULT_RATE_LIMIT);
  const now = options.now || (() => Date.now());
  const buckets = new Map();
  let requestsSinceCleanup = 0;

  function cleanup(currentTime = now()) {
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.startedAt >= windowMs) buckets.delete(key);
    }
  }

  function allow(key) {
    const currentTime = now();
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 250 || buckets.size > 2000) {
      requestsSinceCleanup = 0;
      cleanup(currentTime);
    }

    const bucket = buckets.get(key);
    if (!bucket || currentTime - bucket.startedAt >= windowMs) {
      buckets.set(key, { startedAt: currentTime, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  return { allow, cleanup, size: () => buckets.size };
}

function readBody(req, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
        settled = true;
        const error = new Error('request too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error('invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeRecord(record, maxRecordBytes = DEFAULT_MAX_RECORD_BYTES) {
  if (!record || !ALLOWED_COLLECTIONS.has(record.collection)) return null;
  if (typeof record.recordId !== 'string' || !record.recordId || record.recordId.length > 200) return null;
  if (!validIso(record.updatedAt)) return null;
  if (record.deletedAt && !validIso(record.deletedAt)) return null;
  if (!record.deletedAt) {
    if (record.payload == null || Buffer.byteLength(JSON.stringify(record.payload), 'utf8') > maxRecordBytes) return null;
    if (record.collection !== 'analytics.days' && record.payload.id !== record.recordId) return null;
  }
  return {
    collection: record.collection,
    record_id: record.recordId,
    payload: record.deletedAt ? null : record.payload,
    record_updated_at: record.updatedAt,
    deleted_at: record.deletedAt || null,
    record_tiebreaker: recordTieBreaker(record)
  };
}

function normalizeCursor(value) {
  if (value == null || value === '') return '0';
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return text.replace(/^0+(?=\d)/, '') || '0';
  if (validIso(text)) return '0';
  const error = new Error('invalid sync cursor');
  error.statusCode = 400;
  throw error;
}

async function ensureSchema(pool) {
  await pool.query(`
    create sequence if not exists sync_change_seq;

    create table if not exists sync_records (
      account_hash text not null,
      collection text not null,
      record_id text not null,
      payload jsonb,
      record_updated_at timestamptz not null,
      deleted_at timestamptz,
      server_updated_at timestamptz not null default now(),
      change_seq bigint not null default nextval('sync_change_seq'),
      record_tiebreaker text not null default '',
      primary key (account_hash, collection, record_id)
    );

    alter table sync_records add column if not exists change_seq bigint;
    alter table sync_records add column if not exists record_tiebreaker text;
    alter table sync_records alter column change_seq set default nextval('sync_change_seq');
    update sync_records set change_seq = nextval('sync_change_seq') where change_seq is null;
    update sync_records
      set record_tiebreaker = case when deleted_at is not null then chr(65535) else '' end
      where record_tiebreaker is null;
    alter table sync_records alter column change_seq set not null;
    alter table sync_records alter column record_tiebreaker set default '';
    alter table sync_records alter column record_tiebreaker set not null;

    create index if not exists sync_records_account_change_idx
      on sync_records (account_hash, change_seq asc);
  `);
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
        deleted_at timestamptz,
        record_tiebreaker text
      )
    )
    insert into sync_records (
      account_hash,
      collection,
      record_id,
      payload,
      record_updated_at,
      deleted_at,
      server_updated_at,
      change_seq,
      record_tiebreaker
    )
    select $1, collection, record_id, payload, record_updated_at, deleted_at, now(), nextval('sync_change_seq'), record_tiebreaker
    from incoming
    on conflict (account_hash, collection, record_id) do update set
      payload = excluded.payload,
      record_updated_at = excluded.record_updated_at,
      deleted_at = excluded.deleted_at,
      server_updated_at = now(),
      change_seq = nextval('sync_change_seq'),
      record_tiebreaker = excluded.record_tiebreaker
    where sync_records.record_updated_at < excluded.record_updated_at
       or (sync_records.record_updated_at = excluded.record_updated_at
           and sync_records.record_tiebreaker collate "C" < excluded.record_tiebreaker collate "C")
  `, [accountHash, JSON.stringify(records)]);
}

async function changedRecords(client, accountHash, cursor, maxRecords) {
  const result = await client.query(`
    select collection, record_id, payload, record_updated_at, deleted_at, change_seq
    from sync_records
    where account_hash = $1 and change_seq > $2::bigint
    order by change_seq asc
    limit $3
  `, [accountHash, cursor, maxRecords + 1]);
  const hasMore = result.rows.length > maxRecords;
  const rows = result.rows.slice(0, maxRecords);
  const nextCursor = rows.length ? String(rows[rows.length - 1].change_seq) : String(cursor);
  return { rows, hasMore, nextCursor };
}

async function authoritativeRecords(client, accountHash, records) {
  if (!records.length) return [];
  const ids = records.map(({ collection, record_id }) => ({ collection, record_id }));
  const result = await client.query(`
    with requested as (
      select * from jsonb_to_recordset($2::jsonb) as x(collection text, record_id text)
    )
    select r.collection, r.record_id, r.payload, r.record_updated_at, r.deleted_at, r.change_seq
    from sync_records r
    join requested q on q.collection = r.collection and q.record_id = r.record_id
    where r.account_hash = $1
  `, [accountHash, JSON.stringify(ids)]);
  return result.rows;
}

function rowToRecord(row) {
  return {
    collection: row.collection,
    recordId: row.record_id,
    payload: row.payload,
    updatedAt: row.record_updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    changeSeq: String(row.change_seq)
  };
}

function mergeRows(...groups) {
  const byKey = new Map();
  for (const rows of groups) {
    for (const row of rows) byKey.set(`${row.collection}:${row.record_id}`, row);
  }
  return [...byKey.values()].sort((a, b) => {
    const seq = BigInt(a.change_seq) - BigInt(b.change_seq);
    if (seq !== 0n) return seq < 0n ? -1 : 1;
    return `${a.collection}:${a.record_id}`.localeCompare(`${b.collection}:${b.record_id}`);
  });
}

function createSyncServer(options) {
  const pool = options.pool;
  const syncPepper = String(options.syncPepper || '');
  const trustProxy = Boolean(options.trustProxy);
  const maxBodyBytes = Number(options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
  const maxRecords = Number(options.maxRecords || DEFAULT_MAX_RECORDS);
  const maxRecordBytes = Number(options.maxRecordBytes || DEFAULT_MAX_RECORD_BYTES);
  const maxDownloadRecords = Number(options.maxDownloadRecords || DEFAULT_MAX_DOWNLOAD_RECORDS);
  const rateLimiter = options.rateLimiter || createRateLimiter({
    windowMs: options.rateWindowMs,
    limit: options.rateLimit
  });

  if (!pool) throw new Error('pool is required');
  if (syncPepper.length < 32) throw new Error('syncPepper must be at least 32 characters');

  async function handleSync(req, res) {
    const ip = clientIp(req, trustProxy);
    if (!rateLimiter.allow(ip)) {
      sendJson(res, 429, { ok: false, error: 'too many sync requests' });
      return;
    }

    const body = await readBody(req, maxBodyBytes);
    const syncKey = String(body.syncKey || '').trim();
    if (syncKey.length < MIN_SYNC_KEY_LENGTH) {
      sendJson(res, 400, { ok: false, error: `syncKey must be at least ${MIN_SYNC_KEY_LENGTH} characters` });
      return;
    }

    const cursor = normalizeCursor(body.cursor);
    const sourceRecords = Array.isArray(body.records) ? body.records : [];
    if (sourceRecords.length > maxRecords) {
      sendJson(res, 413, { ok: false, error: `at most ${maxRecords} sync records are allowed per request` });
      return;
    }
    const records = sourceRecords.map((record) => normalizeRecord(record, maxRecordBytes)).filter(Boolean);
    if (records.length !== sourceRecords.length) {
      sendJson(res, 400, { ok: false, error: 'one or more sync records are invalid' });
      return;
    }

    const accountHash = hashKey(syncKey, syncPepper);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [accountHash]);
      await upsertRecords(client, accountHash, records);
      const changed = await changedRecords(client, accountHash, cursor, maxDownloadRecords);
      const authoritative = await authoritativeRecords(client, accountHash, records);
      const rows = mergeRows(changed.rows, authoritative);
      const syncedAtResult = await client.query('select now() as synced_at');
      const syncedAt = syncedAtResult.rows[0].synced_at;
      await client.query('commit');

      sendJson(res, 200, {
        ok: true,
        cursor: changed.nextCursor,
        syncedAt: syncedAt.toISOString(),
        accepted: records.length,
        hasMore: changed.hasMore,
        records: rows.map(rowToRecord)
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
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
      }
      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/sync') {
        await handleSync(req, res);
        return;
      }
      sendJson(res, 404, { ok: false, error: 'not found' });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendJson(res, error.statusCode || 500, { ok: false, error: error.message || 'sync failed' });
      else res.end();
    }
  });

  return { server, handleSync, rateLimiter };
}

async function startServer() {
  const { Pool } = require('pg');
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = process.env.DATABASE_URL;
  const syncPepper = process.env.SYNC_PEPPER || '';
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (syncPepper.length < 32) throw new Error('SYNC_PEPPER must be at least 32 characters');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
  });
  await ensureSchema(pool);
  const { server } = createSyncServer({
    pool,
    syncPepper,
    trustProxy: process.env.TRUST_PROXY === '1',
    rateLimit: Number(process.env.SYNC_RATE_LIMIT || DEFAULT_RATE_LIMIT)
  });

  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`daymark sync server listening on ${port}`);

  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
  process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
  process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
  return { server, pool, shutdown };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MAX_RECORDS,
  MIN_SYNC_KEY_LENGTH,
  authoritativeRecords,
  changedRecords,
  clientIp,
  createRateLimiter,
  createSyncServer,
  ensureSchema,
  hashKey,
  mergeRows,
  normalizeCursor,
  normalizeRecord,
  recordTieBreaker,
  stableJson,
  startServer,
  upsertRecords
};
