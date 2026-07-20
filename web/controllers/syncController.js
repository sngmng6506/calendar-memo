const MIN_SYNC_KEY_LENGTH = 32;
const CHANGE_SYNC_DEBOUNCE_MS = 800;
const PERIODIC_SYNC_MS = 60000;

export function createSyncController({ state, persist, syncStore, renderAll, showToast }) {
  let timer = null;
  let changeTimer = null;
  let settleTimer = null;
  let inFlight = false;
  let rerunRequested = false;
  let currentStatus = { state: 'idle', message: 'Automatic sync is ready' };

  function configured() {
    return String(state.store.settings.syncKey || '').trim().length >= MIN_SYNC_KEY_LENGTH;
  }

  function touchSettings() {
    state.store.settings.settingsUpdatedAt = new Date().toISOString();
  }

  function status() {
    return { ...currentStatus };
  }

  function renderStatusButton() {
    const button = document.getElementById('syncStatusButton');
    if (!button) return;
    const icon = button.querySelector('.sync-status-icon');
    const icons = { idle: '↻', pending: '↻', syncing: '↻', synced: '✓', error: '!' };
    button.dataset.state = currentStatus.state;
    button.title = currentStatus.message;
    button.setAttribute('aria-label', `동기화 상태: ${currentStatus.message}`);
    if (icon) icon.textContent = icons[currentStatus.state] || '↻';
  }

  function setStatus(nextState, message) {
    if (nextState !== 'synced') {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    currentStatus = { state: nextState, message };
    renderStatusButton();
  }

  function settleToIdle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (currentStatus.state === 'synced') setStatus('idle', 'All changes are synced');
    }, 1800);
  }

  function generateKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function ensureKey() {
    if (configured()) return false;
    state.store.settings.syncKey = generateKey();
    touchSettings();
    await persist({ skipSync: true });
    renderAll();
    return true;
  }

  async function updateSetting(key, value) {
    state.store.settings[key] = String(value || '').trim();
    touchSettings();
    await persist({ skipSync: true });
    if (configured()) requestSync({ delayMs: 0 });
    else setStatus('error', `Personal sync code must be at least ${MIN_SYNC_KEY_LENGTH} characters`);
  }

  async function generateAndSaveKey() {
    state.store.settings.syncKey = generateKey();
    touchSettings();
    await persist({ skipSync: true });
    renderAll();
    showToast('Generated a new personal sync code');
    requestSync({ delayMs: 0 });
  }

  function requestSync(options = {}) {
    clearTimeout(changeTimer);
    changeTimer = null;

    if (!configured()) {
      setStatus('error', `Personal sync code must be at least ${MIN_SYNC_KEY_LENGTH} characters`);
      return;
    }

    if (inFlight) {
      rerunRequested = true;
      return;
    }

    const delayMs = Number(options.delayMs ?? CHANGE_SYNC_DEBOUNCE_MS);
    setStatus('pending', 'Changes are waiting to sync');
    changeTimer = setTimeout(() => {
      changeTimer = null;
      syncNow({ quiet: true, reason: options.reason || 'change' });
    }, Math.max(0, delayMs));
  }

  async function syncNow(options = {}) {
    clearTimeout(changeTimer);
    changeTimer = null;

    if (!configured()) {
      const message = `Personal sync code must be at least ${MIN_SYNC_KEY_LENGTH} characters`;
      setStatus('error', message);
      if (!options.quiet) showToast(message);
      return { success: false, message };
    }

    if (inFlight) {
      rerunRequested = true;
      return { success: false, message: 'Sync already running' };
    }

    inFlight = true;
    setStatus('syncing', options.reason === 'change' ? 'Syncing latest changes' : 'Checking for updates');
    await persist({ skipSync: true });

    let result;
    try {
      result = await syncStore(structuredClone(state.store));
      state.store = result.store || state.store;
      if (!result.success) state.store.settings.lastSyncError = result.message || 'Sync failed';
      await persist({ skipSync: true });

      if (Number(result.downloadedCount || 0) > 0) renderAll();
      if (result.success) {
        setStatus('synced', result.message || 'All changes are synced');
        settleToIdle();
      } else {
        setStatus('error', result.message || 'Sync failed');
      }
      if (!options.quiet) showToast(result.message || (result.success ? 'Synced' : 'Sync failed'));
      return result;
    } catch (error) {
      const message = error.message || 'Sync failed';
      state.store.settings.lastSyncError = message;
      await persist({ skipSync: true });
      setStatus('error', message);
      if (!options.quiet) showToast(message);
      return { success: false, message };
    } finally {
      inFlight = false;
      if (rerunRequested) {
        rerunRequested = false;
        requestSync({ delayMs: 120, reason: 'change' });
      }
    }
  }

  function handlePersisted() {
    requestSync({ reason: 'change' });
  }

  function handleStatusClick() {
    syncNow({ reason: 'manual' });
  }

  function start() {
    stop();
    window.addEventListener('daymark:persisted', handlePersisted);
    document.getElementById('syncStatusButton')?.addEventListener('click', handleStatusClick);
    renderStatusButton();

    timer = setInterval(() => syncNow({ quiet: true, reason: 'poll' }), PERIODIC_SYNC_MS);
    ensureKey()
      .then(() => requestSync({ delayMs: 500, reason: 'startup' }))
      .catch((error) => setStatus('error', error.message || 'Could not initialize sync'));
  }

  function stop() {
    clearInterval(timer);
    clearTimeout(changeTimer);
    clearTimeout(settleTimer);
    timer = null;
    changeTimer = null;
    settleTimer = null;
    window.removeEventListener('daymark:persisted', handlePersisted);
    document.getElementById('syncStatusButton')?.removeEventListener('click', handleStatusClick);
  }

  return {
    MIN_SYNC_KEY_LENGTH,
    configured,
    generateAndSaveKey,
    requestSync,
    start,
    status,
    stop,
    syncNow,
    updateSetting
  };
}
