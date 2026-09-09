const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { PosPrinter } = require('electron-pos-printer');

let mainWindow;
let serverProcess;
let pendingRestorePath = null;

function getConfigPath() {
  const isProd = app.isPackaged;
  if (isProd) {
    return path.join(app.getPath('userData'), 'config.env');
  }
  return path.join(__dirname, '.env');
}

function getBundledNodePath() {
  if (!app.isPackaged) return 'node';
  return path.join(process.resourcesPath, 'app', 'tools', 'node', 'node.exe');
}

function getPublicDir() {
  if (!app.isPackaged) return path.join(__dirname, '..', 'public');
  return path.join(process.resourcesPath, 'app', 'public');
}

function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    content.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
}

function isServerMode() {
  return process.env.USE_MYSQL === 'true';
}

function getServerUrl() {
  if (isServerMode()) {
    return 'http://localhost:3000';
  }
  const serverIp = process.env.SERVER_IP || 'localhost';
  const port = process.env.PORT || '3000';
  return `http://${serverIp}:${port}`;
}

function startServer() {
  const isProd = app.isPackaged;
  const serverPath = isProd
    ? path.join(process.resourcesPath, 'app', 'src', 'backend', 'server.js')
    : path.join(__dirname, 'src', 'backend', 'server.js');

  const nodePath = getBundledNodePath();
  const publicDir = getPublicDir();
  const serverEnv = {
    ...process.env,
    PORT: '3000',
    PUBLIC_DIR: publicDir,
  };

  const args = [serverPath];
  const options = {
    cwd: isProd ? path.join(process.resourcesPath, 'app') : __dirname,
    env: serverEnv,
    stdio: 'inherit',
    detached: false,
  };

  if (isProd) {
    console.log('[ELECTRON] Starting backend with bundled Node:', nodePath);
  }

  serverProcess = spawn(nodePath, args, options);

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Server error:', err.message);
  });

  serverProcess.on('exit', (code, signal) => {
    console.error(`[ELECTRON] Server exited with code ${code} signal ${signal}`);
  });
}

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 500);
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server timeout after ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

async function tryRestoreIfPending() {
  if (!pendingRestorePath || !fs.existsSync(pendingRestorePath)) return;
  const filePath = pendingRestorePath;
  pendingRestorePath = null;
  try {
    const res = await fetch(`${getServerUrl()}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[RESTORE] Failed:', data.error || res.statusText);
    } else {
      console.log('[RESTORE] Completed');
    }
  } catch (err) {
    console.error('[RESTORE] Error:', err.message);
  }
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

  mainWindow.loadURL(getServerUrl());

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('[ELECTRON] Failed to load:', errorCode, errorDesc);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  loadConfig();

  if (isServerMode()) {
    console.log('[ELECTRON] Server mode - starting backend');
    startServer();
    try {
      await waitForServer(`${getServerUrl()}/api/health`);
      console.log('[ELECTRON] Backend ready');
      await tryRestoreIfPending();
      createWindow();
    } catch (err) {
      console.error('[ELECTRON] Backend failed to start:', err.message);
      createWindow();
    }
  } else {
    console.log('[ELECTRON] Client mode - connecting to server');
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
});

ipcMain.handle('select-backup-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Directory',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-sql-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select SQL Backup File',
    filters: [{ name: 'SQL Files', extensions: ['sql'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('save-config', (event, config) => {
  try {
    const configPath = getConfigPath();
    const lines = [
      'USE_MYSQL=true',
      `DB_HOST=${config.dbHost || '127.0.0.1'}`,
      `DB_PORT=${config.dbPort || '3306'}`,
      `DB_USER=${config.dbUser || 'root'}`,
      `DB_PASSWORD=${config.dbPassword || ''}`,
      `DB_NAME=${config.dbName || 'pharmacy_db'}`,
      `PORT=3000`,
      `JWT_SECRET=${config.jwtSecret || 'pharmacy_secret_key_change_in_production'}`,
      `SERVER_IP=${config.serverIp || '192.168.1.100'}`,
    ];
    fs.writeFileSync(configPath, lines.join('\n') + '\n');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-config', () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = {};
      content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
          config[key.trim()] = valueParts.join('=').trim();
        }
      });
      return config;
    }
    return null;
  } catch {
    return null;
  }
});

ipcMain.handle('get-server-ip', () => {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/SERVER_IP=(.+)/);
    return match ? match[1].trim() : null;
  }
  return null;
});

ipcMain.handle('schedule-restore', (event, filePath) => {
  pendingRestorePath = filePath;
  return { success: true };
});

ipcMain.on('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('print-bill', async (event, { html, printerName, paperWidth }) => {
  let win;
  let tempFile = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    const content = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: 'Courier New', monospace; margin: 0; padding: 8px; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
      </style></head><body>${html}</body></html>`;

    const { join } = require('path');
    const os = require('os');
    tempFile = join(os.tmpdir(), `bill-${Date.now()}.html`);
    require('fs').writeFileSync(tempFile, content, 'utf8');

    await win.loadFile(tempFile);

    await new Promise(resolve => {
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', resolve);
      } else {
        resolve();
      }
    });

    const pageSize = paperWidth === '58mm' ? { width: 164.84, height: 1190.55 } : { width: 226.77, height: 1190.55 };
    const printOptions = {
      silent: !!printerName,
      deviceName: printerName || undefined,
      copies: 1,
      printBackground: true,
      pageSize,
      margins: { marginType: 'none' },
    };
    await win.webContents.print(printOptions);
    win.close();
    return { success: true };
  } catch (err) {
    console.error('[PRINT] Error:', err.message);
    if (win) { try { win.close(); } catch (e) {} }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    const win = new BrowserWindow({ show: false });
    const printers = await win.webContents.getPrintersAsync();
    win.close();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  } catch (err) {
    return [];
  }
});

module.exports = { getConfigPath };
