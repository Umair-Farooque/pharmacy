const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let serverProcess;

function startServer() {
  const isProd = app.isPackaged;
  const serverPath = isProd
    ? path.join(process.resourcesPath, 'app', 'src', 'backend', 'server.js')
    : path.join(__dirname, 'src', 'backend', 'server.js');

  const serverEnv = { ...process.env, PORT: '3000' };

  serverProcess = require('child_process').spawn('node', [serverPath], {
    cwd: isProd ? path.join(process.resourcesPath, 'app') : __dirname,
    stdio: 'inherit',
    env: serverEnv,
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Server error:', err.message);
  });
}

function waitForServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 500);
      }).on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('[ELECTRON] Failed to load:', errorCode, errorDesc);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer('http://localhost:3000/api/health');
    console.log('[ELECTRON] Backend ready');
    createWindow();
  } catch (err) {
    console.error('[ELECTRON] Backend failed to start:', err.message);
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
