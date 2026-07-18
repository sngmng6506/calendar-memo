const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store) => ipcRenderer.invoke('store:save', store),
  enableDesktop: () => ipcRenderer.invoke('desktop:enable'),
  disableDesktop: () => ipcRenderer.invoke('desktop:disable'),
  isDesktopActive: () => ipcRenderer.invoke('desktop:is-active'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window:maximized-change', (_event, value) => callback(Boolean(value)));
  },
  close: () => ipcRenderer.invoke('window:close'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text)
});
