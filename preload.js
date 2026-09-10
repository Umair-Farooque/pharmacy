const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
  },
  setupDatabase: (config) => ipcRenderer.invoke('setup-database', config),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getServerIp: () => ipcRenderer.invoke('get-server-ip'),
  getLocalIps: () => ipcRenderer.invoke('get-local-ips'),
  testMysql: (config) => ipcRenderer.invoke('test-mysql', config),
  testServer: (serverIp, port) => ipcRenderer.invoke('test-server', { serverIp, port }),
  openSetup: () => ipcRenderer.invoke('open-setup'),
  launchApp: (payload) => ipcRenderer.invoke('launch-app', payload),
  retryConnection: () => ipcRenderer.invoke('retry-connection'),
  restartApp: () => ipcRenderer.send('restart-app'),
  printBill: (html, printerName, paperWidth) => {
    return ipcRenderer.invoke('print-bill', { html, printerName, paperWidth });
  },
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  selectBackupDir: () => ipcRenderer.invoke('select-backup-dir'),
  selectSqlFile: () => ipcRenderer.invoke('select-sql-file'),
  scheduleRestore: (filePath) => ipcRenderer.invoke('schedule-restore', filePath),
});

