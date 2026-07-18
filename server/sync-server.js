const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
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
      on sync_records (account_hash, server_updated_at desc);
  `);
}

function hashKey(syncKey) {
  return crypto.createHash('sha256').update(String(syncKey || '')).digest('hex');
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error('request too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function validRecord(record) {
  return record
    && typeof record.collection === 'string'
    && typeof record.recordId === 'string'
    && record.recordId
    && typeof record.updatedAt === 'string';
}

async function handleSync(req, res) {
  const body = await readBody(req);
  const syncKey = String(body.syncKey || '').trim();
  if (syncKey.length < 16) {
    sendJson(res, 400, { ok: false, error: 'syncKey must be at least 16 characters' });
    return;
  }

  const accountHash = hashKey(syncKey);
  const records = Array.isArray(body.records) ? body.records.filter(validRecord).slice(0, 5000) : [];
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const record of records) {
      await client.query(`
        insert into sync_records (account_hash, collection, record_id, payload, record_updated_at, deleted_at, server_updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
        on conflict (account_hash, collection, record_id) do update set
          payload = excluded.payload,
          record_updated_at = excluded.record_updated_at,
          deleted_at = excluded.deleted_at,
          server_updated_at = now()
        where sync_records.record_updated_at <= excluded.record_updated_at
      `, [
        accountHash,
        record.collection,
        record.recordId,
        record.deletedAt ? null : record.payload,
        record.updatedAt,
        record.deletedAt || null
      ]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const result = await pool.query(`
    select collection, record_id, payload, record_updated_at, deleted_at
    from sync_records
    where account_hash = $1
    order by server_updated_at asc
  `, [accountHash]);

  sendJson(res, 200, {
    ok: true,
    syncedAt: new Date().toISOString(),
    records: result.rows.map((row) => ({
      collection: row.collection,
      recordId: row.record_id,
      payload: row.payload,
      updatedAt: row.record_updated_at.toISOString(),
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null
    }))
  });
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
    sendJson(res, 500, { ok: false, error: error.message || 'sync failed' });
  }
});

ensureSchema().then(() => {
  server.listen(PORT, () => console.log(`daymark sync server listening on ${PORT}`));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
