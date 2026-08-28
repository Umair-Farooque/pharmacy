const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
  },
  saveConfig: (config) => {
    return ipcRenderer.invoke('save-config', config);
  },
  getConfig: () => {
    return ipcRenderer.invoke('get-config');
  },
  getServerIp: () => {
    return ipcRenderer.invoke('get-server-ip');
  },
  restartApp: () => {
    ipcRenderer.send('restart-app');
  },
});

ipcRenderer.on('restart-app', () => {
  const { app } = require('electron');
  app.relaunch();
  app.exit(0);
});
