const { app, BrowserWindow, ipcMain, clipboard, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const watchFs = require('fs');
const { execFile, spawn } = require('child_process');

const APP_DIR = 'daymark-calendar';
const DEFAULT_SETTINGS = {
  windowOpacity: 0.86,
  desktopMode: false,
  llmBaseUrl: 'https://api.openai.com/v1',
  llmModel: 'gpt-4.1-mini'
};

let mainWindow;
let tray = null;
let desktopState = null;
let inputBridge = null;
let attachWatchdog = null;
let reattaching = false;
let quitting = false;
let devWatcherStarted = false;
let devReloadTimer = null;

function dataDir() {
  return path.join(app.getPath('userData'), APP_DIR);
}

function storePath() {
  return path.join(dataDir(), 'daymark-store.json');
}

function normalizeAnalytics(value) {
  if (!value || typeof value !== 'object') return { days: {} };
  return {
    ...value,
    days: value.days && typeof value.days === 'object' ? value.days : {}
  };
}
async function ensureStore() {
  await fs.mkdir(dataDir(), { recursive: true });
  try {
    const text = await fs.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(text);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      analytics: normalizeAnalytics(parsed.analytics),
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    };
  } catch {
    const initial = { tasks: [], signals: [], analytics: { days: {} }, reports: [], deleted: [], settings: DEFAULT_SETTINGS };
    await fs.writeFile(storePath(), JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

async function saveStore(store) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8');
  return store;
}

function syncEndpoint(settings) {
  const base = String(settings?.syncUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (base.endsWith('/api/sync')) return base;
  return `${base}/api/sync`;
}

function syncRecordsFromStore(store) {
  const records = [];
  for (const task of store.tasks || []) {
    if (!task.id) continue;
    records.push({
      collection: 'tasks',
      recordId: task.id,
      payload: task,
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
    });
  }
  for (const signal of store.signals || []) {
    if (!signal.id) continue;
    records.push({
      collection: 'signals',
      recordId: signal.id,
      payload: signal,
      updatedAt: signal.updatedAt || signal.createdAt || new Date().toISOString()
    });
  }
  for (const [dayId, day] of Object.entries(store.analytics?.days || {})) {
    records.push({
      collection: 'analytics.days',
      recordId: dayId,
      payload: day,
      updatedAt: day.updatedAt || day.lastSeenAt || `${dayId}T00:00:00.000Z`
    });
  }
  for (const report of store.reports || []) {
    if (!report.id) continue;
    records.push({
      collection: 'reports',
      recordId: report.id,
      payload: report,
      updatedAt: report.updatedAt || report.createdAt || new Date().toISOString()
    });
  }
  for (const item of store.deleted || []) {
    if (!item.collection || !item.recordId || !item.deletedAt) continue;
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

function newestTimestamp(...values) {
  return values.filter(Boolean).sort().at(-1) || '';
}

function recordTimestamp(value) {
  if (!value) return '';
  return value.updatedAt || value.lastSeenAt || value.createdAt || '';
}

function upsertById(items, next) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    items.push(next);
    return;
  }
  if (recordTimestamp(items[index]) <= recordTimestamp(next)) items[index] = next;
}

function applyDeleted(store, collection, recordId, deletedAt) {
  store.deleted ||= [];
  const existing = store.deleted.find((item) => item.collection === collection && item.recordId === recordId);
  if (!existing) store.deleted.push({ collection, recordId, deletedAt });
  else if (String(existing.deletedAt) < String(deletedAt)) existing.deletedAt = deletedAt;

  if (collection === 'tasks') store.tasks = (store.tasks || []).filter((task) => task.id !== recordId);
  if (collection === 'signals') store.signals = (store.signals || []).filter((signal) => signal.id !== recordId);
  if (collection === 'reports') store.reports = (store.reports || []).filter((report) => report.id !== recordId);
  if (collection === 'analytics.days' && store.analytics?.days) delete store.analytics.days[recordId];
}

function mergeSyncRecords(store, records) {
  const next = {
    ...store,
    tasks: [...(store.tasks || [])],
    signals: [...(store.signals || [])],
    reports: [...(store.reports || [])],
    deleted: [...(store.deleted || [])],
    analytics: normalizeAnalytics(store.analytics)
  };

  for (const record of records || []) {
    if (record.deletedAt) {
      applyDeleted(next, record.collection, record.recordId, record.deletedAt);
      continue;
    }
    const payload = record.payload;
    if (!payload) continue;
    if (record.collection === 'tasks') upsertById(next.tasks, payload);
    if (record.collection === 'signals') upsertById(next.signals, payload);
    if (record.collection === 'reports') upsertById(next.reports, payload);
    if (record.collection === 'analytics.days') {
      next.analytics.days ||= {};
      const current = next.analytics.days[record.recordId];
      if (!current || newestTimestamp(recordTimestamp(current), record.updatedAt) === record.updatedAt) {
        next.analytics.days[record.recordId] = payload;
      }
    }
  }
  return next;
}

async function syncStore(store) {
  const endpoint = syncEndpoint(store.settings);
  const syncKey = String(store.settings?.syncKey || '').trim();
  if (!endpoint || syncKey.length < 16) {
    return { success: false, message: 'Set SYNC URL and a 16+ character SYNC KEY first.', store };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ syncKey, records: syncRecordsFromStore(store) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    return { success: false, message: body.error || `Sync failed: ${response.status}`, store };
  }

  const merged = mergeSyncRecords(store, body.records || []);
  merged.settings = {
    ...store.settings,
    lastSyncedAt: body.syncedAt || new Date().toISOString(),
    lastSyncError: ''
  };
  await saveStore(merged);
  return { success: true, message: `Synced ${body.records?.length || 0} records`, store: merged };
}

function nativeHandle(window) {
  const buffer = window.getNativeWindowHandle();
  return Number(process.arch === 'x64' ? buffer.readBigUInt64LE(0) : BigInt(buffer.readUInt32LE(0)));
}

function desktopHostPath() {
  if (process.env.DAYMARK_DESKTOP_HOST) return process.env.DAYMARK_DESKTOP_HOST;
  return path.join(
    __dirname,
    '..',
    'tools',
    'daymark-desktop-host',
    'bin',
    'Release',
    'net8.0-windows',
    'win-x64',
    'publish',
    'daymark-desktop-host.exe'
  );
}

async function runDesktopHost(args) {
  const exe = desktopHostPath();
  try {
    await fs.access(exe);
  } catch {
    return {
      success: false,
      message: 'daymark-desktop-host.exe? ????. scripts\\build-desktop-host.ps1 ?? ? ?? ?????.'
    };
  }

  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, message: (stderr || error.message).trim() });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({ success: false, message: 'desktop host ??? ??? ? ????.' });
      }
    });
  });
}

// A saved size is clamped to the display so a stale or hand-edited value can never
// push the wallpaper window off screen.
function resolveDesktopBounds(requested, display) {
  if (!requested) return display;
  // Keep the floor in step with the window's minimum size, otherwise a saved box
  // smaller than that would be silently grown and stop matching what was stored.
  const width = Math.max(980, Math.min(Math.round(Number(requested.width)) || display.width, display.width));
  const height = Math.max(650, Math.min(Math.round(Number(requested.height)) || display.height, display.height));
  const maxX = display.x + display.width - width;
  const maxY = display.y + display.height - height;
  const x = Math.max(display.x, Math.min(Math.round(Number(requested.x)) || display.x, maxX));
  const y = Math.max(display.y, Math.min(Math.round(Number(requested.y)) || display.y, maxY));
  return { x, y, width, height };
}

async function enableDesktopMode(requestedBounds) {
  if (process.platform !== 'win32' || !mainWindow) {
    return { success: false, message: 'Windows??? ???? ??? ??? ? ????.' };
  }

  const hwnd = nativeHandle(mainWindow);
  const displayBounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  const display = resolveDesktopBounds(requestedBounds, displayBounds);
  const normalBounds = mainWindow.getBounds();
  mainWindow.setBounds(display);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setResizable(false);
  mainWindow.setMovable(false);

  const result = await runDesktopHost([
    'attach',
    '--hwnd', String(hwnd),
    '--x', String(display.x),
    '--y', String(display.y),
    '--width', String(display.width),
    '--height', String(display.height)
  ]);

  if (!result.success) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setBounds(display);
    mainWindow.show();
    mainWindow.moveBottom?.();
    desktopState = { mode: 'bottom-window', normalBounds };
    return { success: true, message: 'WorkerW unavailable; using bottom window mode.' };
  }

  desktopState = { ...(result.data || {}), mode: 'workerw', normalBounds, appliedBounds: display };
  startInputBridge(hwnd);
  startAttachWatchdog();
  return { success: true, message: '???? ??? ??????.' };
}

// The shell rebuilds the wallpaper WorkerW whenever the background changes (or
// Explorer restarts), which silently orphans our window. Watch for that and
// re-attach with the same box.
function startAttachWatchdog() {
  stopAttachWatchdog();
  attachWatchdog = setInterval(verifyDesktopAttachment, 4000);
}

function stopAttachWatchdog() {
  if (!attachWatchdog) return;
  clearInterval(attachWatchdog);
  attachWatchdog = null;
}

async function verifyDesktopAttachment() {
  if (reattaching || desktopState?.mode !== 'workerw') return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const hwnd = nativeHandle(mainWindow);
  const status = await runDesktopHost(['status', '--hwnd', String(hwnd)]);
  if (status.success && status.data?.attached) return;

  reattaching = true;
  try {
    const bounds = desktopState?.appliedBounds;
    const normalBounds = desktopState?.normalBounds;
    await enableDesktopMode(bounds);
    // enableDesktopMode captures the current (already desktop-sized) bounds as the
    // restore point, so keep the original one from before desktop mode.
    if (desktopState && normalBounds) desktopState.normalBounds = normalBounds;
  } finally {
    reattaching = false;
  }
}

// Below the icon layer the window gets no mouse input, so a helper process hooks
// desktop clicks and forwards the ones that miss an icon.
function startInputBridge(hwnd, attempt = 0) {
  stopInputBridge();
  const exe = desktopHostPath();
  try {
    inputBridge = spawn(exe, ['interact', '--hwnd', String(hwnd)], {
      windowsHide: true,
      stdio: 'ignore',
      detached: false
    });
    inputBridge.on('exit', () => {
      inputBridge = null;
      // Losing the bridge while still attached leaves the window click-through
      // with no way back, so bring it up again (bounded, in case it cannot start).
      if (desktopState?.mode === 'workerw' && attempt < 3) {
        setTimeout(() => {
          if (!inputBridge && desktopState?.mode === 'workerw') startInputBridge(hwnd, attempt + 1);
        }, 1000);
      }
    });
    inputBridge.on('error', () => { inputBridge = null; });
  } catch {
    inputBridge = null;
  }
}

function stopInputBridge() {
  if (!inputBridge) return;
  try {
    inputBridge.kill();
  } catch {
    // already gone
  }
  inputBridge = null;
}

async function disableDesktopMode() {
  stopAttachWatchdog();
  stopInputBridge();
  const state = desktopState;
  if (state?.mode === 'bottom-window') {
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    if (state.normalBounds) mainWindow.setBounds(state.normalBounds);
    mainWindow.show();
    desktopState = null;
    return { success: true, message: '? ??? ??????.' };
  }

  const hwnd = nativeHandle(mainWindow);
  const result = await runDesktopHost([
    'detach',
    '--hwnd', String(hwnd),
    '--parent', String(state?.parent ?? 0),
    '--style', String(state?.style ?? 0),
    '--exStyle', String(state?.exStyle ?? 0)
  ]);

  mainWindow.setSkipTaskbar(false);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  if (state?.normalBounds) mainWindow.setBounds(state.normalBounds);
  desktopState = null;

  if (!result.success) return { success: false, message: result.message || '? ?? ??? ??????.' };
  return { success: true, message: '? ??? ??????.' };
}

function isDevMode() {
  return process.env.DAYMARK_DEV === '1';
}

function scheduleDevReload(kind) {
  clearTimeout(devReloadTimer);
  devReloadTimer = setTimeout(() => {
    if (kind === 'app') {
      app.relaunch();
      app.exit(0);
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  }, 120);
}

function watchPath(target, kind) {
  try {
    watchFs.watch(target, { recursive: false }, (_event, filename) => {
      if (!filename) return;
      scheduleDevReload(kind);
    });
  } catch (error) {
    console.warn(`Dev watcher failed for ${target}: ${error.message}`);
  }
}

function startDevWatcher() {
  if (!isDevMode() || devWatcherStarted) return;
  devWatcherStarted = true;

  watchPath(path.join(__dirname, '..', 'web'), 'renderer');
  watchPath(path.join(__dirname, 'main.js'), 'app');
  watchPath(path.join(__dirname, 'preload.js'), 'app');
}
function createWindow() {
  const primary = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1320, primary.width),
    height: Math.min(860, primary.height),
    // The layout is built for a wide window and has no narrow fallback, so keep
    // the floor at the width it is designed for.
    minWidth: 980,
    minHeight: 650,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));

  mainWindow.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  startDevWatcher();
}

// The window is frameless and hides from the taskbar in desktop mode, where it is
// also click-through (the shell icon layer sits above it). The tray is therefore
// the only reliable way to get back to window mode, reach settings, or quit.
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Daymark Ops Console', enabled: false },
    { type: 'separator' },
    {
      label: desktopState ? '창 모드로 전환' : '바탕화면 모드로 전환',
      click: () => mainWindow?.webContents.send('tray:toggle-desktop')
    },
    { label: '설정 열기', click: () => mainWindow?.webContents.send('tray:open-settings') },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } }
  ]);
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Daymark Ops Console');
  tray.on('double-click', () => mainWindow?.webContents.send('tray:toggle-desktop'));
  refreshTrayMenu();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Our window is a child of the wallpaper WorkerW, so when the shell rebuilds
  // that layer (wallpaper change, Explorer restart) it destroys our window too.
  // Rebuild instead of exiting; the renderer re-applies desktop mode on load.
  if (!quitting && desktopState) {
    desktopState = null;
    stopAttachWatchdog();
    stopInputBridge();
    createWindow();
    return;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  stopAttachWatchdog();
  stopInputBridge();
  if (tray && !tray.isDestroyed()) tray.destroy();
});

ipcMain.handle('store:load', async () => ensureStore());
ipcMain.handle('store:save', async (_event, store) => saveStore(store));
ipcMain.handle('sync:run', async (_event, store) => syncStore(store));
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow || desktopState) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('desktop:enable', async (_event, bounds) => {
  const result = await enableDesktopMode(bounds);
  refreshTrayMenu();
  return result;
});
// Launching at login has to point at this app explicitly: when unpackaged,
// process.execPath is Electron itself and would otherwise start with no app.
function loginItemOptions(enabled) {
  const options = { openAtLogin: enabled, path: process.execPath };
  if (!app.isPackaged) options.args = [app.getAppPath()];
  return options;
}

ipcMain.handle('app:get-auto-start', () => {
  if (process.platform !== 'win32') return false;
  return Boolean(app.getLoginItemSettings(loginItemOptions(true)).openAtLogin);
});
ipcMain.handle('app:set-auto-start', (_event, enabled) => {
  if (process.platform !== 'win32') return false;
  app.setLoginItemSettings(loginItemOptions(Boolean(enabled)));
  return Boolean(app.getLoginItemSettings(loginItemOptions(true)).openAtLogin);
});

ipcMain.handle('window:bounds', () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null));
ipcMain.handle('window:set-bounds', (_event, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed() || !bounds) return null;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  mainWindow.setBounds(resolveDesktopBounds(bounds, display));
  return mainWindow.getBounds();
});
ipcMain.handle('desktop:display-bounds', () => {
  if (process.platform !== 'win32') return null;
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
});
ipcMain.handle('desktop:disable', async () => {
  const result = await disableDesktopMode();
  refreshTrayMenu();
  return result;
});
ipcMain.handle('desktop:is-active', () => Boolean(desktopState));
ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text || '')));





