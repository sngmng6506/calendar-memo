const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store) => ipcRenderer.invoke('store:save', store),
  syncStore: (store) => ipcRenderer.invoke('sync:run', store),
  enableDesktop: (bounds) => ipcRenderer.invoke('desktop:enable', bounds),
  displayBounds: () => ipcRenderer.invoke('desktop:display-bounds'),
  getAutoStart: () => ipcRenderer.invoke('app:get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-auto-start', enabled),
  windowBounds: () => ipcRenderer.invoke('window:bounds'),
  setWindowBounds: (bounds) => ipcRenderer.invoke('window:set-bounds', bounds),
  disableDesktop: () => ipcRenderer.invoke('desktop:disable'),
  isDesktopActive: () => ipcRenderer.invoke('desktop:is-active'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window:maximized-change', (_event, value) => callback(Boolean(value)));
  },
  close: () => ipcRenderer.invoke('window:close'),
  onTrayToggleDesktop: (callback) => {
    ipcRenderer.on('tray:toggle-desktop', () => callback());
  },
  onTrayOpenSettings: (callback) => {
    ipcRenderer.on('tray:open-settings', () => callback());
  },
  copy: (text) => ipcRenderer.invoke('clipboard:write', text)
});
