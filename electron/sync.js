'use strict';

const {
  markTombstonesSynced,
  mergeSyncRecords,
  pruneDeleted,
  syncRecordsFromStore
} = require('./data-model');

const MIN_SYNC_KEY_LENGTH = 32;
const REQUEST_TIMEOUT_MS = 15000;

function syncEndpoint(settings) {
  const raw = String(settings?.syncUrl || '').trim();
  if (!raw) return { endpoint: '', error: 'Set a sync URL first.' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { endpoint: '', error: 'SYNC URL is not a valid URL.' };
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localHost && url.protocol === 'http:')) {
    return { endpoint: '', error: 'SYNC URL must use HTTPS. HTTP is allowed only for localhost.' };
  }
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/api/sync') ? basePath : `${basePath}/api/sync`;
  return { endpoint: url.toString(), error: '' };
}

function createSyncService(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const saveStore = options.saveStore;
  const now = options.now || (() => new Date());

  async function sync(store) {
    const { endpoint, error } = syncEndpoint(store.settings);
    const syncKey = String(store.settings?.syncKey || '').trim();
    if (error || syncKey.length < MIN_SYNC_KEY_LENGTH) {
      return {
        success: false,
        message: error || `SYNC KEY must be at least ${MIN_SYNC_KEY_LENGTH} characters.`,
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
      return { success: false, message, store };
    } finally {
      clearTimeout(timer);
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      return { success: false, message: body.error || `Sync failed: ${response.status}`, store };
    }

    const syncedAt = body.syncedAt || now().toISOString();
    const merged = mergeSyncRecords(store, body.records || [], { syncedAt });
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
      message: `Synced ${outgoing.length} up / ${(body.records || []).length} down`,
      store: saved
    };
  }

  return { sync };
}

module.exports = { MIN_SYNC_KEY_LENGTH, createSyncService, syncEndpoint };
