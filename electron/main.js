'use strict';

const { app, BrowserWindow, ipcMain, clipboard, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const watchFs = require('fs');
const { execFile, spawn } = require('child_process');
const { createStoreManager } = require('./store');
const { createSyncService } = require('./sync');

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

const storeManager = createStoreManager({
  fs,
  dataDir,
  filename: 'daymark-store.json',
  defaultSettings: DEFAULT_SETTINGS
});
const syncService = createSyncService({
  saveStore: (store) => storeManager.save(store)
});

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
  const executable = desktopHostPath();
  try {
    await fs.access(executable);
  } catch {
    return {
      success: false,
      message: 'Desktop helper is missing. Run scripts\\build-desktop-host.ps1 first.'
    };
  }

  return new Promise((resolve) => {
    execFile(executable, args, { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, message: (stderr || error.message).trim() });
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ success: false, message: 'Desktop helper returned an invalid response.' });
      }
    });
  });
}

function resolveDesktopBounds(requested, display) {
  if (!requested) return display;
  const width = Math.max(980, Math.min(Math.round(Number(requested.width)) || display.width, display.width));
  const height = Math.max(650, Math.min(Math.round(Number(requested.height)) || display.height, display.height));
  const maxX = display.x + display.width - width;
  const maxY = display.y + display.height - height;
  const x = Math.max(display.x, Math.min(Math.round(Number(requested.x)) || display.x, maxX));
  const y = Math.max(display.y, Math.min(Math.round(Number(requested.y)) || display.y, maxY));
  return { x, y, width, height };
}

async function enableDesktopMode(requestedBounds) {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) {
    return { success: false, message: 'Desktop mode is available only on Windows.' };
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
    desktopState = { mode: 'bottom-window', normalBounds, appliedBounds: display };
    return { success: true, message: 'WorkerW unavailable; using bottom-window mode.' };
  }

  desktopState = { ...(result.data || {}), mode: 'workerw', normalBounds, appliedBounds: display };
  startInputBridge(hwnd);
  startAttachWatchdog();
  return { success: true, message: 'Attached to the Windows desktop.' };
}

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
    if (desktopState && normalBounds) desktopState.normalBounds = normalBounds;
  } finally {
    reattaching = false;
  }
}

function startInputBridge(hwnd, attempt = 0) {
  stopInputBridge();
  try {
    inputBridge = spawn(desktopHostPath(), ['interact', '--hwnd', String(hwnd)], {
      windowsHide: true,
      stdio: 'ignore',
      detached: false
    });
    inputBridge.on('exit', () => {
      inputBridge = null;
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
    // The helper already exited.
  }
  inputBridge = null;
}

async function disableDesktopMode() {
  stopAttachWatchdog();
  stopInputBridge();
  const state = desktopState;
  if (!mainWindow || mainWindow.isDestroyed()) {
    desktopState = null;
    return { success: true, message: 'Window is already closed.' };
  }

  if (!state) {
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    return { success: true, message: 'Window mode is already active.' };
  }

  if (state.mode === 'bottom-window') {
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    if (state.normalBounds) mainWindow.setBounds(state.normalBounds);
    mainWindow.show();
    desktopState = null;
    return { success: true, message: 'Returned to window mode.' };
  }

  const hwnd = nativeHandle(mainWindow);
  const result = await runDesktopHost([
    'detach',
    '--hwnd', String(hwnd),
    '--parent', String(state.parent ?? 0),
    '--style', String(state.style ?? 0),
    '--exStyle', String(state.exStyle ?? 0)
  ]);

  mainWindow.setSkipTaskbar(false);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  if (state.normalBounds) mainWindow.setBounds(state.normalBounds);
  desktopState = null;

  if (!result.success) return { success: false, message: result.message || 'Could not detach from the desktop.' };
  return { success: true, message: 'Returned to window mode.' };
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
      if (filename) scheduleDevReload(kind);
    });
  } catch (error) {
    console.warn(`Dev watcher failed for ${target}: ${error.message}`);
  }
}

function startDevWatcher() {
  if (!isDevMode() || devWatcherStarted) return;
  devWatcherStarted = true;
  watchPath(path.join(__dirname, '..', 'web'), 'renderer');
  watchPath(__dirname, 'app');
}

function createWindow() {
  const primary = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1320, primary.width),
    height: Math.min(860, primary.height),
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
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));
  mainWindow.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  startDevWatcher();
}

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

function loginItemOptions(enabled) {
  const options = { openAtLogin: enabled, path: process.execPath };
  if (!app.isPackaged) options.args = [app.getAppPath()];
  return options;
}

function registerIpcHandlers() {
  ipcMain.handle('store:load', () => storeManager.load());
  ipcMain.handle('store:save', (_event, store) => storeManager.save(store));
  ipcMain.handle('sync:run', (_event, store) => syncService.sync(store));
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
  ipcMain.handle('desktop:disable', async () => {
    const result = await disableDesktopMode();
    refreshTrayMenu();
    return result;
  });
  ipcMain.handle('desktop:is-active', () => Boolean(desktopState));
  ipcMain.handle('desktop:display-bounds', () => {
    if (process.platform !== 'win32') return null;
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  });
  ipcMain.handle('window:bounds', () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null));
  ipcMain.handle('window:set-bounds', (_event, bounds) => {
    if (!mainWindow || mainWindow.isDestroyed() || !bounds) return null;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    mainWindow.setBounds(resolveDesktopBounds(bounds, display));
    return mainWindow.getBounds();
  });
  ipcMain.handle('app:get-auto-start', () => {
    if (process.platform !== 'win32') return false;
    return Boolean(app.getLoginItemSettings(loginItemOptions(true)).openAtLogin);
  });
  ipcMain.handle('app:set-auto-start', (_event, enabled) => {
    if (process.platform !== 'win32') return false;
    app.setLoginItemSettings(loginItemOptions(Boolean(enabled)));
    return Boolean(app.getLoginItemSettings(loginItemOptions(true)).openAtLogin);
  });
  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text || '')));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
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
