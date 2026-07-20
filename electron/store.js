'use strict';

const path = require('path');
const { mergeStoreSnapshots, normalizeStore } = require('./data-model');

function createInitialStore(defaultSettings = {}) {
  return normalizeStore({
    tasks: [],
    signals: [],
    analytics: { days: {} },
    reports: [],
    deleted: [],
    settings: defaultSettings
  }, defaultSettings);
}

function createStoreManager(options) {
  const fs = options.fs;
  const resolveDataDir = options.dataDir;
  const filename = options.filename || 'daymark-store.json';
  const defaultSettings = options.defaultSettings || {};
  const now = options.now || (() => new Date());
  const logger = options.logger || console;
  let currentStore = null;
  let saveQueue = Promise.resolve();

  function paths() {
    const directory = typeof resolveDataDir === 'function' ? resolveDataDir() : resolveDataDir;
    const target = path.join(directory, filename);
    return { directory, target, backup: `${target}.bak` };
  }

  async function readStore(filePath) {
    const text = await fs.readFile(filePath, 'utf8');
    return normalizeStore(JSON.parse(text), defaultSettings);
  }

  async function exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function atomicWrite(store, { skipBackup = false } = {}) {
    const { directory, target, backup } = paths();
    await fs.mkdir(directory, { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    const text = `${JSON.stringify(store, null, 2)}\n`;
    let handle;
    try {
      handle = await fs.open(temp, 'w');
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle?.close();
    }

    if (!skipBackup && await exists(target)) await fs.copyFile(target, backup);
    try {
      await fs.rename(temp, target);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await fs.rm(target, { force: true });
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }

  async function recoverFromFailure(error) {
    const { target, backup } = paths();
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const corrupted = `${target}.corrupted-${stamp}`;
    if (await exists(target)) {
      await fs.copyFile(target, corrupted).catch((copyError) => {
        logger.error('Could not preserve corrupted store', copyError);
      });
    }

    try {
      const recovered = await readStore(backup);
      recovered.settings.lastStoreRecovery = `Recovered from backup at ${now().toISOString()}. Preserved damaged file as ${path.basename(corrupted)}.`;
      recovered.settings.settingsUpdatedAt = now().toISOString();
      await atomicWrite(recovered, { skipBackup: true });
      return recovered;
    } catch (backupError) {
      const initial = createInitialStore(defaultSettings);
      initial.settings.lastStoreRecovery = `Created a new store at ${now().toISOString()} after preserving an unreadable file as ${path.basename(corrupted)}. No valid backup was available.`;
      initial.settings.settingsUpdatedAt = now().toISOString();
      await atomicWrite(initial, { skipBackup: true });
      logger.error('Store recovery used a new empty store', error, backupError);
      return initial;
    }
  }

  async function load() {
    const { directory, target, backup } = paths();
    await fs.mkdir(directory, { recursive: true });
    try {
      currentStore = await readStore(target);
      return structuredClone(currentStore);
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          currentStore = await readStore(backup);
          currentStore.settings.lastStoreRecovery = `Restored missing store from backup at ${now().toISOString()}.`;
          currentStore.settings.settingsUpdatedAt = now().toISOString();
          await atomicWrite(currentStore, { skipBackup: true });
          return structuredClone(currentStore);
        } catch {
          currentStore = createInitialStore(defaultSettings);
          await atomicWrite(currentStore, { skipBackup: true });
          return structuredClone(currentStore);
        }
      }
      currentStore = await recoverFromFailure(error);
      return structuredClone(currentStore);
    }
  }

  function save(incoming) {
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      if (!currentStore) {
        try {
          currentStore = await readStore(paths().target);
        } catch {
          currentStore = createInitialStore(defaultSettings);
        }
      }
      currentStore = mergeStoreSnapshots(currentStore, incoming, defaultSettings);
      currentStore.meta.revision = Number(currentStore.meta.revision || 0) + 1;
      currentStore.meta.lastSavedAt = now().toISOString();
      await atomicWrite(currentStore);
      return structuredClone(currentStore);
    });
    return saveQueue;
  }

  function getCurrent() {
    return currentStore ? structuredClone(currentStore) : null;
  }

  return { load, save, getCurrent, paths };
}

module.exports = { createInitialStore, createStoreManager };
