'use strict';

const COLLECTIONS = Object.freeze(['tasks', 'signals', 'reports', 'analytics.days']);
const COLLECTION_SET = new Set(COLLECTIONS);
const DEFAULT_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function timestampMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTimestamp(left, right) {
  return timestampMs(left) - timestampMs(right);
}

function recordTimestamp(value, fallback = '') {
  if (!value || typeof value !== 'object') return fallback;
  return value.updatedAt || value.lastSeenAt || value.createdAt || fallback;
}

function stableJson(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function incomingWins(current, next, currentTimestamp, nextTimestamp) {
  const comparison = compareTimestamp(nextTimestamp, currentTimestamp);
  if (comparison !== 0) return comparison > 0;
  return stableJson(next) >= stableJson(current);
}

function normalizeAnalytics(value) {
  if (!value || typeof value !== 'object') return { days: {} };
  return {
    ...clone(value),
    days: value.days && typeof value.days === 'object' ? clone(value.days) : {}
  };
}

function normalizeDeleted(value) {
  const latest = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || !COLLECTION_SET.has(item.collection) || !item.recordId || !item.deletedAt) continue;
    const key = `${item.collection}:${item.recordId}`;
    const current = latest.get(key);
    if (!current || compareTimestamp(item.deletedAt, current.deletedAt) >= 0) latest.set(key, clone(item));
  }
  return [...latest.values()];
}

function normalizeStore(value, defaultSettings = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    tasks: Array.isArray(source.tasks) ? clone(source.tasks) : [],
    signals: Array.isArray(source.signals) ? clone(source.signals) : [],
    analytics: normalizeAnalytics(source.analytics),
    reports: Array.isArray(source.reports) ? clone(source.reports) : [],
    deleted: normalizeDeleted(source.deleted),
    settings: { ...clone(defaultSettings), ...(source.settings && typeof source.settings === 'object' ? clone(source.settings) : {}) },
    meta: {
      schemaVersion: 1,
      revision: Number(source.meta?.revision || 0),
      lastSavedAt: source.meta?.lastSavedAt || ''
    }
  };
}

function findTombstone(store, collection, recordId) {
  return (store.deleted || []).find((item) => item.collection === collection && item.recordId === recordId) || null;
}

function removeTombstone(store, collection, recordId) {
  store.deleted = (store.deleted || []).filter((item) => item.collection !== collection || item.recordId !== recordId);
}

function upsertTombstone(store, next) {
  store.deleted ||= [];
  const existing = findTombstone(store, next.collection, next.recordId);
  if (!existing) {
    store.deleted.push(clone(next));
    return;
  }
  if (compareTimestamp(next.deletedAt, existing.deletedAt) >= 0) Object.assign(existing, clone(next));
}

function collectionArray(store, collection) {
  if (collection === 'tasks') return store.tasks;
  if (collection === 'signals') return store.signals;
  if (collection === 'reports') return store.reports;
  return null;
}

function getRecord(store, collection, recordId) {
  if (collection === 'analytics.days') return store.analytics?.days?.[recordId] || null;
  const items = collectionArray(store, collection);
  return items?.find((item) => item.id === recordId) || null;
}

function removeRecord(store, collection, recordId) {
  if (collection === 'analytics.days') {
    if (store.analytics?.days) delete store.analytics.days[recordId];
    return;
  }
  if (collection === 'tasks') store.tasks = (store.tasks || []).filter((item) => item.id !== recordId);
  if (collection === 'signals') store.signals = (store.signals || []).filter((item) => item.id !== recordId);
  if (collection === 'reports') store.reports = (store.reports || []).filter((item) => item.id !== recordId);
}

function setRecord(store, collection, recordId, payload) {
  if (collection === 'analytics.days') {
    store.analytics ||= { days: {} };
    store.analytics.days ||= {};
    store.analytics.days[recordId] = clone(payload);
    return;
  }

  const items = collectionArray(store, collection);
  if (!items) return;
  const index = items.findIndex((item) => item.id === recordId);
  const next = { ...clone(payload), id: payload.id || recordId };
  if (index === -1) items.push(next);
  else items[index] = next;
}

function applyDeleted(store, record, options = {}) {
  if (!record || !COLLECTION_SET.has(record.collection) || !record.recordId || !record.deletedAt) return false;
  const local = getRecord(store, record.collection, record.recordId);
  const localTimestamp = recordTimestamp(local);
  if (local && compareTimestamp(localTimestamp, record.deletedAt) > 0) return false;

  removeRecord(store, record.collection, record.recordId);
  upsertTombstone(store, {
    collection: record.collection,
    recordId: record.recordId,
    deletedAt: record.deletedAt,
    ...(record.syncedAt || options.syncedAt ? { syncedAt: record.syncedAt || options.syncedAt } : {})
  });
  return true;
}

function applyPayload(store, record) {
  if (!record || !COLLECTION_SET.has(record.collection) || !record.recordId || !record.payload) return false;
  const nextTimestamp = record.updatedAt || recordTimestamp(record.payload);
  const tombstone = findTombstone(store, record.collection, record.recordId);
  if (tombstone && compareTimestamp(tombstone.deletedAt, nextTimestamp) >= 0) return false;

  const current = getRecord(store, record.collection, record.recordId);
  const currentTimestamp = recordTimestamp(current);
  if (!current || incomingWins(current, record.payload, currentTimestamp, nextTimestamp)) {
    setRecord(store, record.collection, record.recordId, record.payload);
    removeTombstone(store, record.collection, record.recordId);
    return true;
  }
  return false;
}

function mergeSyncRecords(store, records, options = {}) {
  const next = normalizeStore(store, store?.settings || {});
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.deletedAt) applyDeleted(next, record, options);
    else applyPayload(next, record);
  }
  return next;
}

function recordsFromStore(store) {
  const records = [];
  for (const task of store.tasks || []) {
    if (task.id) records.push({ collection: 'tasks', recordId: task.id, payload: task, updatedAt: recordTimestamp(task) });
  }
  for (const signal of store.signals || []) {
    if (signal.id) records.push({ collection: 'signals', recordId: signal.id, payload: signal, updatedAt: recordTimestamp(signal) });
  }
  for (const report of store.reports || []) {
    if (report.id) records.push({ collection: 'reports', recordId: report.id, payload: report, updatedAt: recordTimestamp(report) });
  }
  for (const [recordId, day] of Object.entries(store.analytics?.days || {})) {
    records.push({
      collection: 'analytics.days',
      recordId,
      payload: day,
      updatedAt: recordTimestamp(day, `${recordId}T00:00:00.000Z`)
    });
  }
  return records;
}

function syncRecordsFromStore(store, since = '') {
  const sinceMs = timestampMs(since);
  const records = recordsFromStore(store).filter((record) => timestampMs(record.updatedAt) > sinceMs);
  for (const item of store.deleted || []) {
    if (!item.collection || !item.recordId || !item.deletedAt) continue;
    if (timestampMs(item.deletedAt) <= sinceMs && item.syncedAt) continue;
    records.push({
      collection: item.collection,
      recordId: item.recordId,
      payload: null,
      updatedAt: item.deletedAt,
      deletedAt: item.deletedAt
    });
  }
  return records;
}

function mergeSettings(current = {}, incoming = {}) {
  const currentChanged = timestampMs(current.settingsUpdatedAt);
  const incomingChanged = timestampMs(incoming.settingsUpdatedAt);
  const base = !currentChanged || incomingChanged >= currentChanged
    ? { ...current, ...clone(incoming) }
    : { ...clone(incoming), ...current };

  const currentSync = timestampMs(current.lastSyncedAt);
  const incomingSync = timestampMs(incoming.lastSyncedAt);
  if (currentSync > incomingSync) {
    base.lastSyncedAt = current.lastSyncedAt;
    base.syncCursor = current.syncCursor;
    base.lastSyncError = current.lastSyncError;
  }
  return base;
}

function mergeStoreSnapshots(current, incoming, defaultSettings = {}) {
  const base = normalizeStore(current, defaultSettings);
  const source = normalizeStore(incoming, defaultSettings);
  const combinedRecords = recordsFromStore(source);
  for (const tombstone of source.deleted) {
    combinedRecords.push({
      collection: tombstone.collection,
      recordId: tombstone.recordId,
      deletedAt: tombstone.deletedAt,
      updatedAt: tombstone.deletedAt,
      syncedAt: tombstone.syncedAt
    });
  }
  const merged = mergeSyncRecords(base, combinedRecords);
  merged.settings = mergeSettings(base.settings, source.settings);
  merged.meta = { ...base.meta };
  return merged;
}

function markTombstonesSynced(store, records, syncedAt) {
  for (const record of records || []) {
    if (!record.deletedAt) continue;
    const tombstone = findTombstone(store, record.collection, record.recordId);
    if (tombstone && compareTimestamp(tombstone.deletedAt, record.deletedAt) === 0) tombstone.syncedAt = syncedAt;
  }
}

function pruneDeleted(store, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now || Date.now());
  const retentionMs = Number(options.retentionMs || DEFAULT_TOMBSTONE_RETENTION_MS);
  const cutoff = now - retentionMs;
  store.deleted = (store.deleted || []).filter((item) => {
    if (!item.syncedAt) return true;
    return timestampMs(item.deletedAt) >= cutoff;
  });
  return store;
}

module.exports = {
  COLLECTIONS,
  COLLECTION_SET,
  DEFAULT_TOMBSTONE_RETENTION_MS,
  applyDeleted,
  applyPayload,
  compareTimestamp,
  findTombstone,
  markTombstonesSynced,
  mergeStoreSnapshots,
  mergeSyncRecords,
  normalizeAnalytics,
  normalizeStore,
  pruneDeleted,
  recordTimestamp,
  recordsFromStore,
  syncRecordsFromStore,
  timestampMs
};
