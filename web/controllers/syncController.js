const MIN_SYNC_KEY_LENGTH = 32;

export function createSyncController({ state, persist, syncStore, renderAll, showToast }) {
  let timer = null;
  let inFlight = false;

  function configured() {
    return Boolean(
      String(state.store.settings.syncUrl || '').trim()
      && String(state.store.settings.syncKey || '').trim().length >= MIN_SYNC_KEY_LENGTH
    );
  }

  function touchSettings() {
    state.store.settings.settingsUpdatedAt = new Date().toISOString();
  }

  async function updateSetting(key, value) {
    state.store.settings[key] = String(value || '').trim();
    touchSettings();
    await persist();
  }

  function generateKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function generateAndSaveKey() {
    state.store.settings.syncKey = generateKey();
    touchSettings();
    await persist();
    renderAll();
    showToast('Generated a 256-bit sync key');
  }

  async function syncNow(options = {}) {
    if (inFlight || !configured()) {
      if (!options.quiet && !configured()) showToast(`Set SYNC URL and a ${MIN_SYNC_KEY_LENGTH}+ character SYNC KEY first`);
      return;
    }

    inFlight = true;
    await persist();
    try {
      const result = await syncStore(structuredClone(state.store));
      state.store = result.store || state.store;
      if (!result.success) state.store.settings.lastSyncError = result.message || 'Sync failed';
      await persist();
      renderAll();
      if (!options.quiet) showToast(result.message || (result.success ? 'Synced' : 'Sync failed'));
    } catch (error) {
      state.store.settings.lastSyncError = error.message || 'Sync failed';
      await persist();
      if (!options.quiet) showToast(state.store.settings.lastSyncError);
    } finally {
      inFlight = false;
    }
  }

  function start() {
    stop();
    timer = setInterval(() => syncNow({ quiet: true }), 180000);
    setTimeout(() => syncNow({ quiet: true }), 1200);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    MIN_SYNC_KEY_LENGTH,
    configured,
    generateAndSaveKey,
    start,
    stop,
    syncNow,
    updateSetting
  };
}
