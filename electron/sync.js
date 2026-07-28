'use strict';

const {
  markRecordsSynced,
  mergeSyncRecords,
  pruneDeleted,
  syncRecordsFromStore
} = require('./data-model');

const MIN_SYNC_KEY_LENGTH = 32;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_UPLOAD_RECORDS = 1000;
const MAX_UPLOAD_BYTES = 3_500_000;
const MAX_SYNC_ROUNDS = 1000;

function syncEndpoint(settings, configuredUrl = '') {
  const raw = String(configuredUrl || settings?.syncUrl || '').trim();
  if (!raw) return { endpoint: '', error: 'Sync server is not configured.' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { endpoint: '', error: 'The configured sync server URL is invalid.' };
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localHost && url.protocol === 'http:')) {
    return { endpoint: '', error: 'The sync server must use HTTPS. HTTP is allowed only for localhost.' };
  }
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/api/sync') ? basePath : `${basePath}/api/sync`;
  return { endpoint: url.toString(), error: '' };
}

function uploadChunk(records, offset, maxRecords, maxBytes) {
  const chunk = [];
  let bytes = 2;
  for (let index = offset; index < records.length && chunk.length < maxRecords; index += 1) {
    const record = records[index];
    const recordBytes = Buffer.byteLength(JSON.stringify(record), 'utf8') + (chunk.length ? 1 : 0);
    if (chunk.length && bytes + recordBytes > maxBytes) break;
    chunk.push(record);
    bytes += recordBytes;
    if (bytes >= maxBytes) break;
  }
  return chunk;
}

function createSyncService(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const saveStore = options.saveStore;
  const now = options.now || (() => new Date());
  const configuredUrl = String(options.syncUrl || process.env.DAYMARK_SYNC_URL || '').trim();
  const requestTimeoutMs = Number(options.requestTimeoutMs || REQUEST_TIMEOUT_MS);
  const maxUploadRecords = Number(options.maxUploadRecords || MAX_UPLOAD_RECORDS);
  const maxUploadBytes = Number(options.maxUploadBytes || MAX_UPLOAD_BYTES);

  async function requestPage(endpoint, syncKey, cursor, records) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ syncKey, cursor: cursor || null, records }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        return { success: false, message: body.error || `Sync failed: ${response.status}` };
      }
      return { success: true, body };
    } catch (error) {
      return {
        success: false,
        message: error.name === 'AbortError' ? 'Sync timed out.' : `Sync failed: ${error.message}`
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function persistFailure(store, cursor, message) {
    store.settings = {
      ...store.settings,
      syncCursor: cursor || store.settings?.syncCursor || '0',
      lastSyncError: message
    };
    try {
      return await saveStore(store);
    } catch {
      return store;
    }
  }

  async function sync(store) {
    const { endpoint, error } = syncEndpoint(store.settings, configuredUrl);
    const syncKey = String(store.settings?.syncKey || '').trim();
    if (error || syncKey.length < MIN_SYNC_KEY_LENGTH) {
      return {
        success: false,
        message: error || `SYNC KEY must be at least ${MIN_SYNC_KEY_LENGTH} characters.`,
        uploadedCount: 0,
        downloadedCount: 0,
        store
      };
    }

    let working = structuredClone(store);
    let cursor = String(store.settings?.syncCursor || '0').trim() || '0';
    const outgoing = syncRecordsFromStore(working);
    let uploadOffset = 0;
    let uploadedCount = 0;
    let downloadedCount = 0;
    let lastSyncedAt = '';
    let hasMore = true;

    for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
      const chunk = uploadChunk(outgoing, uploadOffset, maxUploadRecords, maxUploadBytes);
      const previousCursor = cursor;
      const result = await requestPage(endpoint, syncKey, cursor, chunk);
      if (!result.success) {
        const saved = await persistFailure(working, cursor, result.message);
        return { success: false, message: result.message, uploadedCount, downloadedCount, store: saved };
      }

      const body = result.body;
      const incoming = Array.isArray(body.records) ? body.records : [];
      const syncedAt = body.syncedAt || now().toISOString();
      working = mergeSyncRecords(working, incoming, { syncedAt });
      markRecordsSynced(working, incoming);
      cursor = String(body.cursor ?? cursor);
      lastSyncedAt = syncedAt;
      uploadOffset += chunk.length;
      uploadedCount += chunk.length;
      downloadedCount += incoming.length;
      hasMore = Boolean(body.hasMore);

      if (hasMore && cursor === previousCursor) {
        const message = 'Sync server returned more data without advancing the cursor.';
        const saved = await persistFailure(working, cursor, message);
        return { success: false, message, uploadedCount, downloadedCount, store: saved };
      }

      if (uploadOffset >= outgoing.length && !hasMore) break;
      if (round === MAX_SYNC_ROUNDS - 1) {
        const message = 'Sync exceeded the maximum number of transfer rounds.';
        const saved = await persistFailure(working, cursor, message);
        return { success: false, message, uploadedCount, downloadedCount, store: saved };
      }
    }

    pruneDeleted(working, { now: now().getTime() });
    working.settings = {
      ...working.settings,
      syncCursor: cursor,
      lastSyncedAt: lastSyncedAt || now().toISOString(),
      lastSyncError: ''
    };
    const saved = await saveStore(working);
    return {
      success: true,
      message: `Synced ${uploadedCount} up / ${downloadedCount} received`,
      uploadedCount,
      downloadedCount,
      store: saved
    };
  }

  return { sync };
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_RECORDS,
  MIN_SYNC_KEY_LENGTH,
  REQUEST_TIMEOUT_MS,
  createSyncService,
  syncEndpoint,
  uploadChunk
};
