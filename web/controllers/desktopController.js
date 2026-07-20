const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

export function createDesktopController({ state, els, persist, renderAll, showToast, openSettings }) {
  const unsubscribers = [];

  function touchSettings() {
    state.store.settings.settingsUpdatedAt = new Date().toISOString();
  }

  async function init() {
    state.displayBounds = await window.daymark.displayBounds?.().catch(() => null);
    state.autoStart = Boolean(await window.daymark.getAutoStart?.().catch(() => false));
    applySurfaceOpacity(Number(state.store.settings.windowOpacity ?? 0.86));
    const unsubscribeToggle = window.daymark.onTrayToggleDesktop?.(() => {
      setDesktopMode(!state.store.settings.desktopMode);
    });
    const unsubscribeSettings = window.daymark.onTrayOpenSettings?.(async () => {
      if (state.store.settings.desktopMode) await setDesktopMode(false);
      openSettings();
    });
    if (unsubscribeToggle) unsubscribers.push(unsubscribeToggle);
    if (unsubscribeSettings) unsubscribers.push(unsubscribeSettings);
  }

  function dispose() {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
  }

  function applySurfaceOpacity(opacity) {
    const value = Math.max(0, Math.min(1, Number(opacity)));
    document.documentElement.style.setProperty('--surface-alpha', String(value));
  }

  async function setOpacity(value, options = {}) {
    const next = Math.max(0, Math.min(1, Number(value)));
    state.store.settings.windowOpacity = next;
    touchSettings();
    applySurfaceOpacity(next);
    await persist(options);
  }

  async function toggleAutoStart() {
    const next = !state.autoStart;
    state.autoStart = Boolean(await window.daymark.setAutoStart?.(next));
    renderAll();
    showToast(state.autoStart === next
      ? (next ? 'Starts with Windows' : 'Auto start off')
      : 'Could not change auto start');
  }

  function clampToDisplay(bounds) {
    const screen = state.displayBounds;
    if (!bounds || !screen) return bounds || null;
    const width = Math.min(Math.max(980, bounds.width), screen.width);
    const height = Math.min(Math.max(650, bounds.height), screen.height);
    return {
      width,
      height,
      x: Math.max(screen.x, Math.min(bounds.x, screen.x + screen.width - width)),
      y: Math.max(screen.y, Math.min(bounds.y, screen.y + screen.height - height))
    };
  }

  async function startDesktopSizeAdjust() {
    state.resumeDesktopAfterAdjust = Boolean(state.store.settings.desktopMode);
    if (state.store.settings.desktopMode) await setDesktopMode(false, { quiet: true });
    const target = state.store.settings.desktopBounds || state.displayBounds;
    if (target) await window.daymark.setWindowBounds?.(target);
    state.adjustingDesktopSize = true;
    renderAll();
    showToast('Resize and move the window, then press SAVE');
  }

  async function finishDesktopSizeAdjust(save) {
    if (save) {
      const bounds = clampToDisplay(await window.daymark.windowBounds?.());
      if (bounds) {
        const screen = state.displayBounds;
        const isFull = screen
          && bounds.x === screen.x && bounds.y === screen.y
          && bounds.width === screen.width && bounds.height === screen.height;
        state.store.settings.desktopBounds = isFull ? null : bounds;
        touchSettings();
        await persist();
      }
    }

    state.adjustingDesktopSize = false;
    const resume = state.resumeDesktopAfterAdjust;
    state.resumeDesktopAfterAdjust = false;
    renderAll();
    if (resume) await setDesktopMode(true, { quiet: true });
    showToast(save ? 'Desktop size saved' : 'Size adjust cancelled');
  }

  async function beginResize(event, dir) {
    event.preventDefault();
    const start = await window.daymark.windowBounds?.();
    if (!start) return;
    const originX = event.screenX;
    const originY = event.screenY;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let frame = 0;
    let pending = null;

    const onMove = (moveEvent) => {
      const dx = moveEvent.screenX - originX;
      const dy = moveEvent.screenY - originY;
      const next = { ...start };
      if (dir.includes('e')) next.width = start.width + dx;
      if (dir.includes('s')) next.height = start.height + dy;
      if (dir.includes('w')) { next.x = start.x + dx; next.width = start.width - dx; }
      if (dir.includes('n')) { next.y = start.y + dy; next.height = start.height - dy; }
      pending = next;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pending) window.daymark.setWindowBounds?.(pending);
      });
    };

    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (frame) cancelAnimationFrame(frame);
      if (pending) window.daymark.setWindowBounds?.(pending);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function renderResizeHandles() {
    const host = els.resizeHandles;
    if (!host) return;
    host.classList.toggle('hidden', !state.adjustingDesktopSize);
    if (!state.adjustingDesktopSize) {
      host.innerHTML = '';
      return;
    }
    if (host.childElementCount) return;
    for (const dir of RESIZE_DIRECTIONS) {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.dataset.dir = dir;
      handle.addEventListener('pointerdown', (event) => beginResize(event, dir));
      host.appendChild(handle);
    }
  }

  function renderSizeAdjustBar() {
    const bar = els.sizeAdjustBar;
    if (!bar) return;
    bar.classList.toggle('hidden', !state.adjustingDesktopSize);
    if (!state.adjustingDesktopSize) {
      bar.innerHTML = '';
      return;
    }
    bar.innerHTML = `
      <span>Drag the window edges to set the desktop size</span>
      <button class="terminal-button" type="button" data-size-adjust="save">SAVE</button>
      <button class="terminal-button" type="button" data-size-adjust="cancel">CANCEL</button>
    `;
    bar.querySelector('[data-size-adjust="save"]').addEventListener('click', () => finishDesktopSizeAdjust(true));
    bar.querySelector('[data-size-adjust="cancel"]').addEventListener('click', () => finishDesktopSizeAdjust(false));
  }

  async function setDesktopMode(enabled, options = {}) {
    const result = enabled
      ? await window.daymark.enableDesktop(state.store.settings.desktopBounds || null)
      : await window.daymark.disableDesktop();
    if (!result.success) {
      state.store.settings.desktopMode = false;
      touchSettings();
      await persist();
      if (!options.quiet) showToast(result.message || 'Could not change desktop mode');
      renderAll();
      return;
    }
    state.store.settings.desktopMode = enabled;
    touchSettings();
    await persist();
    renderAll();
    if (!options.quiet) showToast(result.message || (enabled ? 'Desktop mode on' : 'Window mode on'));
  }

  function desktopSizeLabel() {
    const saved = state.store.settings.desktopBounds;
    return saved ? ` (${saved.width}x${saved.height})` : ' (FULL)';
  }

  return {
    desktopSizeLabel,
    dispose,
    init,
    renderResizeHandles,
    renderSizeAdjustBar,
    setDesktopMode,
    setOpacity,
    startDesktopSizeAdjust,
    toggleAutoStart
  };
}
