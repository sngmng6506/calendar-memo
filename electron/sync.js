'use strict';

const {
  markTombstonesSynced,
  mergeSyncRecords,
  pruneDeleted,
  syncRecordsFromStore
} = require('./data-model');

const MIN_SYNC_KEY_LENGTH = 32;
const REQUEST_TIMEOUT_MS = 15000;

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

function createSyncService(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const saveStore = options.saveStore;
  const now = options.now || (() => new Date());
  const configuredUrl = String(options.syncUrl || process.env.DAYMARK_SYNC_URL || '').trim();

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

    const cursor = String(store.settings?.syncCursor || '').trim();
    const outgoing = syncRecordsFromStore(store, cursor);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ syncKey, cursor: cursor || null, records: outgoing }),
        signal: controller.signal
      });
    } catch (requestError) {
      const message = requestError.name === 'AbortError' ? 'Sync timed out.' : `Sync failed: ${requestError.message}`;
      return {
        success: false,
        message,
        uploadedCount: outgoing.length,
        downloadedCount: 0,
        store
      };
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      return {
        success: false,
        message: body.error || `Sync failed: ${response.status}`,
        uploadedCount: outgoing.length,
        downloadedCount: 0,
        store
      };
    }

    const incoming = Array.isArray(body.records) ? body.records : [];
    const syncedAt = body.syncedAt || now().toISOString();
    const merged = mergeSyncRecords(store, incoming, { syncedAt });
    markTombstonesSynced(merged, outgoing, syncedAt);
    pruneDeleted(merged, { now: now().getTime() });
    merged.settings = {
      ...store.settings,
      syncCursor: body.cursor || syncedAt,
      lastSyncedAt: syncedAt,
      lastSyncError: ''
    };
    const saved = await saveStore(merged);
    return {
      success: true,
      message: `Synced ${outgoing.length} up / ${incoming.length} down`,
      uploadedCount: outgoing.length,
      downloadedCount: incoming.length,
      store: saved
    };
  }

  return { sync };
}

module.exports = { MIN_SYNC_KEY_LENGTH, createSyncService, syncEndpoint };
