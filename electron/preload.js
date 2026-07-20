'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback, mapValue = (...args) => args) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, ...args) => callback(mapValue(...args));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

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
  onMaximizedChange: (callback) => subscribe('window:maximized-change', callback, Boolean),
  close: () => ipcRenderer.invoke('window:close'),
  onTrayToggleDesktop: (callback) => subscribe('tray:toggle-desktop', callback, () => undefined),
  onTrayOpenSettings: (callback) => subscribe('tray:open-settings', callback, () => undefined),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text)
});
