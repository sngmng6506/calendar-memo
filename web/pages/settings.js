import { escapeHtml } from '../utils.js';

export function renderSettingsInspector({ inspector, state, desktop, sync }) {
  const opacity = Number(state.store.settings.windowOpacity ?? 0.86);
  const lastSync = state.store.settings.lastSyncedAt || 'never';
  const lastError = state.store.settings.lastSyncError || '';
  const recovery = state.store.settings.lastStoreRecovery || '';
  const screenBounds = state.displayBounds;
  inspector.innerHTML = `
    <div class="inspector-block">
      <div class="eyebrow">SETTINGS</div>
      <h2>SURFACE</h2>
      <div class="setting-row">
        <label for="opacityRange">BACKGROUND ALPHA <strong id="opacityValue">${Math.round(opacity * 100)}%</strong></label>
        <input id="opacityRange" type="range" min="0" max="1" step="0.01" value="${opacity}">
      </div>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">SYNC</div>
      <div class="setting-row">
        <label for="syncUrlInput">SYNC URL</label>
        <input id="syncUrlInput" class="settings-input" value="${escapeHtml(state.store.settings.syncUrl || '')}" placeholder="https://your-app.up.railway.app" autocomplete="off">
      </div>
      <div class="setting-row">
        <label for="syncKeyInput">SYNC KEY</label>
        <input id="syncKeyInput" class="settings-input" type="password" value="${escapeHtml(state.store.settings.syncKey || '')}" placeholder="${sync.MIN_SYNC_KEY_LENGTH}+ characters" autocomplete="off">
      </div>
      <button class="terminal-button full" type="button" data-command="generate-sync-key">GENERATE SECURE KEY</button>
      <div class="kv"><span>LAST SYNC</span><strong>${escapeHtml(lastSync)}</strong></div>
      ${lastError ? `<p class="muted">${escapeHtml(lastError)}</p>` : ''}
      <button class="terminal-button full" type="button" data-command="sync-now">SYNC NOW</button>
    </div>
    <div class="inspector-block">
      <div class="eyebrow">WINDOW</div>
      <button class="terminal-button full" type="button" data-command="desktop">${state.store.settings.desktopMode ? 'DETACH FROM DESKTOP' : 'ATTACH TO DESKTOP'}</button>
      <button class="terminal-button full" type="button" data-command="desktop-drag">DRAG TO RESIZE${desktop.desktopSizeLabel()}</button>
      <button class="terminal-button full${state.autoStart ? ' active' : ''}" type="button" data-command="auto-start">START WITH WINDOWS [${state.autoStart ? 'ON' : 'OFF'}]</button>
      <p class="muted">${screenBounds ? `SCREEN ${screenBounds.width} x ${screenBounds.height}` : ''}</p>
    </div>
    ${recovery ? `<div class="inspector-block"><div class="eyebrow">DATA RECOVERY</div><p class="muted">${escapeHtml(recovery)}</p></div>` : ''}
  `;

  const range = inspector.querySelector('#opacityRange');
  const value = inspector.querySelector('#opacityValue');
  range.addEventListener('input', () => {
    const next = Number(range.value);
    value.textContent = `${Math.round(next * 100)}%`;
    desktop.setOpacity(next, { debounceMs: 180 });
  });
  range.addEventListener('change', () => desktop.setOpacity(Number(range.value)));

  const syncUrl = inspector.querySelector('#syncUrlInput');
  const syncKey = inspector.querySelector('#syncKeyInput');
  syncUrl.addEventListener('blur', () => sync.updateSetting('syncUrl', syncUrl.value));
  syncKey.addEventListener('blur', () => sync.updateSetting('syncKey', syncKey.value));
  inspector.querySelector('[data-command="generate-sync-key"]').addEventListener('click', sync.generateAndSaveKey);
  inspector.querySelector('[data-command="sync-now"]').addEventListener('click', () => sync.syncNow());
  inspector.querySelector('[data-command="desktop"]').addEventListener('click', () => desktop.setDesktopMode(!state.store.settings.desktopMode));
  inspector.querySelector('[data-command="desktop-drag"]').addEventListener('click', desktop.startDesktopSizeAdjust);
  inspector.querySelector('[data-command="auto-start"]').addEventListener('click', desktop.toggleAutoStart);
}
