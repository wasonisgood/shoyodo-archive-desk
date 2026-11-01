const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopControl', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedState: (callback) => {
    ipcRenderer.on('window-maximized-state', (_event, isMax) => callback(isMax));
  },
  onTriggerCrawlFromTray: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-crawl-from-tray', handler);
    return () => ipcRenderer.removeListener('trigger-crawl-from-tray', handler);
  },
  getPaths: () => ipcRenderer.invoke('app-get-paths'),
  getVersion: () => ipcRenderer.invoke('app-get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app-check-update'),
  getAutostart: () => ipcRenderer.invoke('autostart-get'),
  setAutostart: (enable) => ipcRenderer.invoke('autostart-set', enable),
  showNotification: (titleOrPayload, body) => {
    const payload = typeof titleOrPayload === 'object' ? titleOrPayload : { title: titleOrPayload, body };
    return ipcRenderer.invoke('show-windows-notification', payload);
  },
});

contextBridge.exposeInMainWorld('authControl', {
  getSession: () => ipcRenderer.invoke('auth-get-session'),
  saveSession: (session) => ipcRenderer.invoke('auth-save-session', session),
  clearSession: () => ipcRenderer.invoke('auth-clear-session'),
  openWebLogin: () => ipcRenderer.invoke('auth-open-web-login'),
  onAuthGranted: (callback) => {
    const handler = (_event, session) => callback(session);
    ipcRenderer.on('admin-auth-granted', handler);
    return () => ipcRenderer.removeListener('admin-auth-granted', handler);
  },
});

contextBridge.exposeInMainWorld('bridgeControl', {
  getSharedData: () => ipcRenderer.invoke('bridge-get-data'),
  addProspect: (item) => ipcRenderer.invoke('bridge-add-prospect', item),
  promoteToBook: (book) => ipcRenderer.invoke('bridge-promote-to-book', book),
  removeProspect: (id) => ipcRenderer.invoke('bridge-remove-prospect', id),
  onDataUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('bridge-data-updated', handler);
    return () => ipcRenderer.removeListener('bridge-data-updated', handler);
  }
});

contextBridge.exposeInMainWorld('crawlerControl', {
  startScan: (config) => ipcRenderer.invoke('crawler-start-scan', config),
  onLog: (callback) => {
    const handler = (_event, log) => callback(log);
    ipcRenderer.on('crawler-log', handler);
    return () => ipcRenderer.removeListener('crawler-log', handler);
  },
  onNewItem: (callback) => {
    const handler = (_event, item) => callback(item);
    ipcRenderer.on('crawler-new-item', handler);
    return () => ipcRenderer.removeListener('crawler-new-item', handler);
  }
});
