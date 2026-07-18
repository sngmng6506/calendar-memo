const { app, BrowserWindow, ipcMain, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const watchFs = require('fs');
const { execFile } = require('child_process');

const APP_DIR = 'daymark-calendar';
const DEFAULT_SETTINGS = {
  windowOpacity: 0.86,
  desktopMode: false,
  llmBaseUrl: 'https://api.openai.com/v1',
  llmModel: 'gpt-4.1-mini'
};

let mainWindow;
let desktopState = null;
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
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    };
  } catch {
    const initial = { tasks: [], signals: [], analytics: { days: {} }, reports: [], settings: DEFAULT_SETTINGS };
    await fs.writeFile(storePath(), JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

async function saveStore(store) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8');
  return store;
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

async function enableDesktopMode() {
  if (process.platform !== 'win32' || !mainWindow) {
    return { success: false, message: 'Windows??? ???? ??? ??? ? ????.' };
  }

  const hwnd = nativeHandle(mainWindow);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
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
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setBounds(normalBounds);
    return { success: false, message: result.message || '???? ?? ??? ??????.' };
  }

  desktopState = { ...(result.data || {}), normalBounds };
  return { success: true, message: '???? ??? ??????.' };
}

async function disableDesktopMode() {
  return { success: true, message: '? ??? ??????.' };
  const hwnd = nativeHandle(mainWindow);
  const state = desktopState;
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('store:load', async () => ensureStore());
ipcMain.handle('store:save', async (_event, store) => saveStore(store));
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow || desktopState) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('desktop:enable', () => enableDesktopMode());
ipcMain.handle('desktop:disable', () => disableDesktopMode());
ipcMain.handle('desktop:is-active', () => Boolean(desktopState));
ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text || '')));





