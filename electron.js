const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');

let mainWindow;
let serverProcess = null;
let pendingRestorePath = null;

function getConfigPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'config.env');
  }
  return path.join(__dirname, '.env');
}

function getBundledNodePath() {
  if (!app.isPackaged) return 'node';
  return path.join(process.resourcesPath, 'app', 'tools', 'node', 'node.exe');
}

function getPublicDir() {
  if (!app.isPackaged) return path.join(__dirname, 'public');
  return path.join(process.resourcesPath, 'app', 'public');
}

function getSetupPagePath() {
  return path.join(getPublicDir(), 'setup.html');
}

function getErrorPagePath() {
  return path.join(getPublicDir(), 'error.html');
}

function checkIfConfigured() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return false;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    if (content.includes('SETUP_COMPLETE=true')) return true;
    if (content.includes('USE_MYSQL=')) {
      // In dev mode or existing valid config
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valueParts] = trimmed.split('=');
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
    // IMPORTANT: use 127.0.0.1, NOT localhost. On Windows, `localhost` resolves
    // to ::1 (IPv6) first, but Express binds 0.0.0.0 (IPv4 only), so health
    // checks to http://localhost:3000 get ECONNREFUSED forever and were
    // misreported as "Server connection timeout after 25000ms".
    return 'http://127.0.0.1:3000';
  }
  const serverIp = process.env.SERVER_IP || '127.0.0.1';
  const port = process.env.PORT || '3000';
  return `http://${serverIp}:${port}`;
}

// Map MySQL/system error codes to clear, stage-specific messages.
// Never include DB_PASSWORD or other secrets in the output.
function describeError(err, stage) {
  const code = (err && err.code) || null;
  const errno = (err && err.errno) != null ? err.errno : null;
  const sqlState = (err && err.sqlState) || null;
  let message = (err && err.message) || String(err);
  let hint;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case 1045:
      hint = 'MySQL authentication failed: incorrect username or password.';
      break;
    case 'ER_BAD_DB_ERROR':
    case 1049:
      hint = `MySQL database not found: ${message}`;
      break;
    case 'ER_DBACCESS_DENIED_ERROR':
      hint = 'MySQL user does not have permission to access this database.';
      break;
    case 'ER_DB_CREATE_EXISTS':
      hint = 'Database already exists and could not be created.';
      break;
    case 'ECONNREFUSED':
      hint = `MySQL connection refused at ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}. Is the MySQL service running?`;
      break;
    case 'ETIMEDOUT':
      hint = `MySQL connection timed out at ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}.`;
      break;
    case 'ENOTFOUND':
      hint = 'MySQL host could not be resolved.';
      break;
    case 'EADDRINUSE':
      hint = 'Express port 3000 is already used by another application.';
      break;
    default:
      hint = message;
  }
  return { stage, code, errno, sqlState, message: hint, raw: message };
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch (e) {}
    serverProcess = null;
  }
}

// Kill any process occupying port 3000 (orphaned server from prev crash)
function killPortProcess(port) {
  return new Promise((resolve) => {
    try {
      const { execSync } = require('child_process');
      // Find PID using netstat
      const result = execSync(
        `netstat -ano | findstr :${port}`,
        { timeout: 3000, windowsHide: true }
      ).toString();
      const lines = result.split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // Format: Proto  Local  Foreign  State  PID
        if (parts.length >= 5 && line.includes(`0.0.0.0:${port}`)) {
          const pid = parseInt(parts[parts.length - 1]);
          if (pid && !isNaN(pid) && pid !== process.pid) pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 3000, windowsHide: true });
          console.log(`[ELECTRON] Killed orphaned process PID ${pid} on port ${port}`);
        } catch (e) {
          // PID already gone or no permission
        }
      }
    } catch (e) {
      // netstat failed or port was free - that's fine
    }
    resolve();
  });
}

let serverOutput = '';
let serverExitError = null;

async function startServer() {
  if (serverProcess && !serverProcess.killed) {
    return;
  }

  serverOutput = '';
  serverExitError = null;

  // Free port 3000 from any previous orphaned process
  await killPortProcess(3000);

  const isProd = app.isPackaged;
  const serverPath = isProd
    ? path.join(process.resourcesPath, 'app', 'src', 'backend', 'server.js')
    : path.join(__dirname, 'src', 'backend', 'server.js');

  const nodePath = getBundledNodePath();
  const publicDir = getPublicDir();
  const configPath = getConfigPath();

  const serverEnv = {
    ...process.env,
    PORT: '3000',
    PUBLIC_DIR: publicDir,
    CONFIG_PATH: configPath,
    USE_MYSQL: 'true',
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT || '3306',
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    DB_NAME: process.env.DB_NAME || 'pharmacy_db',
  };

  const args = [serverPath];
  const options = {
    cwd: isProd ? path.join(process.resourcesPath, 'app') : __dirname,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };

  if (isProd) {
    console.log('[ELECTRON] Starting backend with bundled Node:', nodePath);
  } else {
    console.log('[ELECTRON] Starting backend with system Node');
  }

  serverProcess = spawn(nodePath, args, options);

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      serverOutput += msg;
      console.log('[SERVER STDOUT]:', msg.trim());
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      serverOutput += msg;
      console.error('[SERVER STDERR]:', msg.trim());
    });
  }

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Server process error:', err.message);
    serverExitError = `Failed to launch server process: ${err.message}`;
  });

  serverProcess.on('exit', (code, signal) => {
    console.warn(`[ELECTRON] Server process exited with code ${code} signal ${signal}`);
    if (code !== 0 && code !== null) {
      const lines = serverOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      // Extract the most meaningful error line
      const errorLine = lines.find(l =>
        l.includes('SETUP-FATAL') || l.includes('SERVER-FATAL') ||
        l.includes('EADDRINUSE') || l.includes('Access denied') ||
        l.includes('Failed to start') || l.includes('Auto-setup failed') ||
        l.includes('ECONNREFUSED') || l.includes('ER_') ||
        l.includes('Cannot find module')
      );
      const lastLines = lines.slice(-5).join(' | ');
      serverExitError = errorLine || lastLines || `Server process exited unexpectedly (code ${code})`;
    }
    serverProcess = null;
  });
}

function waitForServer(url, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (serverExitError) {
        return reject(new Error(serverExitError));
      }
      if (serverProcess === null && Date.now() - start > 1000) {
        return reject(new Error(serverExitError || 'Server process stopped unexpectedly.'));
      }

      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      });

      req.on('error', () => {
        if (serverExitError) {
          return reject(new Error(serverExitError));
        }
        if (Date.now() - start > timeout) {
          reject(new Error(serverExitError || `Server connection timeout after ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      });

      req.setTimeout(2500, () => {
        req.destroy();
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
      console.log('[RESTORE] Completed successfully');
    }
  } catch (err) {
    console.error('[RESTORE] Error:', err.message);
  }
}

function getPreloadPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'preload.js');
  }
  return path.join(__dirname, 'preload.js');
}

function ensureWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: 'Al-Hafiz Pharmacy',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('[ELECTRON] Preload script error in', preloadPath, error);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
    console.error('[ELECTRON] Failed to load URL:', validatedURL, errorCode, errorDesc);
    // Don't intercept file:// loads like setup.html or error.html
    if (validatedURL && validatedURL.startsWith('http')) {
      showErrorPage({
        mode: isServerMode() ? 'server' : 'client',
        serverUrl: getServerUrl(),
        error: `${errorDesc} (${errorCode})`,
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function showSetupPage() {
  const win = ensureWindow();
  win.loadFile(getSetupPagePath());
}

function showErrorPage(query = {}) {
  const win = ensureWindow();
  win.loadFile(getErrorPagePath(), { query });
}

async function launchMainApp() {
  const win = ensureWindow();
  const url = getServerUrl();
  console.log('[ELECTRON] Loading main app from:', url);
  await win.loadURL(url);
}

function createApplicationMenu() {
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Setup & Connection Settings...',
          click: () => {
            showSetupPage();
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Re-run Setup Wizard',
          click: () => {
            showSetupPage();
          },
        },
        {
          label: 'About Al-Hafiz Pharmacy',
          click: () => {
            dialog.showMessageBox(mainWindow || null, {
              type: 'info',
              title: 'Al-Hafiz Pharmacy',
              message: 'Al-Hafiz Pharmacy Management System\nVersion 1.0.0',
              detail: `Mode: ${isServerMode() ? 'Server PC (Database Host)' : 'Client PC (Terminal)'}\nServer URL: ${getServerUrl()}`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  createApplicationMenu();
  loadConfig();

  const isConfigured = checkIfConfigured();

  if (!isConfigured) {
    console.log('[ELECTRON] First-time run: opening Setup Wizard');
    showSetupPage();
  } else if (isServerMode()) {
    console.log('[ELECTRON] Configured as Server PC - starting backend...');
    await startServer();
    try {
      await waitForServer(`${getServerUrl()}/api/health`, 25000);
      startPrintService();
      console.log('[ELECTRON] Server ready, checking pending restore...');
      await tryRestoreIfPending();
      await launchMainApp();
    } catch (err) {
      console.error('[ELECTRON] Server start failed:', err.message);
      showErrorPage({
        mode: 'server',
        error: err.message,
      });
    }
  } else {
    console.log('[ELECTRON] Configured as Client PC - connecting to:', getServerUrl());
    try {
      // Fast check if server PC is reachable
      await waitForServer(`${getServerUrl()}/api/health`, 5000);
      await launchMainApp();
    } catch (err) {
      console.error('[ELECTRON] Cannot reach Server PC:', err.message);
      showErrorPage({
        mode: 'client',
        serverUrl: getServerUrl(),
        error: err.message,
      });
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!checkIfConfigured()) {
        showSetupPage();
      } else {
        launchMainApp().catch(() => showSetupPage());
      }
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServer();
});

// IPC Handlers
ipcMain.handle('get-local-ips', () => {
  try {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    return addresses.length > 0 ? addresses : ['127.0.0.1'];
  } catch (err) {
    console.error('[IPC] get-local-ips error:', err.message);
    return ['127.0.0.1'];
  }
});

ipcMain.handle('test-mysql', async (event, config) => {
  // Check 1: MySQL SERVER connectivity (intentionally WITHOUT the target
  // database, because on first run the database does not exist yet).
  try {
    const host = config.host || '127.0.0.1';
    const port = parseInt(config.port) || 3306;
    const user = config.user || 'root';
    const password = config.password || '';
    const database = (config.database || '').trim();

    console.log(`[SETUP] Testing MySQL server at ${host}:${port}`);
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 4000,
    });

    try {
      await connection.query('SELECT 1');
      console.log('[SETUP] MySQL server connection successful');
      await connection.end();

      // Check 2 (informational): does the selected database already exist
      // and can this user access it? This must never fail the server test.
      let databaseStatus = null;
      if (database) {
        try {
          const exists = await mysql.createConnection({ host, port, user, password, connectTimeout: 4000 });
          const [rows] = await exists.query(
            'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
            [database]
          );
          await exists.end();
          if (rows.length > 0) {
            const dbConn = await mysql.createConnection({ host, port, user, password, database, connectTimeout: 4000 });
            await dbConn.query('SELECT 1');
            await dbConn.end();
            databaseStatus = 'accessible';
          } else {
            databaseStatus = 'missing';
          }
        } catch (dbErr) {
          const d = describeError(dbErr, 'validate-database');
          databaseStatus = 'inaccessible';
          return {
            success: true,
            databaseStatus,
            message: 'Connected to MySQL server successfully, but the selected database is not accessible: ' + d.message,
            warning: d.message,
          };
        }
      }

      return {
        success: true,
        databaseStatus,
        message:
          databaseStatus === 'missing'
            ? `Connected to MySQL server successfully! Database '${database}' does not exist yet - it will be created during setup.`
            : 'Connected to MySQL successfully!',
      };
    } catch (queryErr) {
      await connection.end().catch(() => {});
      const d = describeError(queryErr, 'mysql-server-test');
      console.error(`[SETUP] MySQL server test failed: code=${d.code} ${d.raw}`);
      return { success: false, error: d.message, code: d.code, stage: d.stage };
    }
  } catch (err) {
    const d = describeError(err, 'mysql-server-test');
    console.error(`[SETUP] MySQL server test failed: code=${d.code} ${d.raw}`);
    return { success: false, error: d.message, code: d.code, stage: d.stage };
  }
});

// BUG 4/BUG 5: Create the database and initialize the schema via Electron IPC,
// BEFORE saving the production config and BEFORE starting the backend.
// Reuses the existing autoSetup() helper (server connection without DB ->
// CREATE DATABASE IF NOT EXISTS -> connection WITH DB -> idempotent schema).
ipcMain.handle('setup-database', async (event, config) => {
  try {
    const host = config.dbHost || '127.0.0.1';
    const port = parseInt(config.dbPort) || 3306;
    const user = config.dbUser || 'root';
    const password = config.dbPassword || '';
    const dbName = (config.dbName || '').trim();

    if (!/^[A-Za-z0-9_$]{1,64}$/.test(dbName)) {
      return {
        success: false,
        stage: 'database-setup',
        message: `Invalid database name '${dbName}'. Use letters, digits, underscore only.`,
      };
    }

    console.log(`[SETUP] Creating/initializing database: ${dbName}`);
    process.env.DB_HOST = host;
    process.env.DB_PORT = String(port);
    process.env.DB_USER = user;
    process.env.DB_PASSWORD = password;
    process.env.DB_NAME = dbName;

    const autoSetup = require('./src/backend/db/autoSetup');
    await autoSetup();
    console.log(`[SETUP] Database '${dbName}' created and schema initialized`);
    return { success: true, message: `Database '${dbName}' created and schema initialized.` };
  } catch (err) {
    const d = describeError(err, 'database-setup');
    console.error(`[SETUP] Database setup failed: stage=${d.stage} code=${d.code} errno=${d.errno} sqlState=${d.sqlState} ${d.raw}`);
    return { success: false, stage: d.stage, code: d.code, errno: d.errno, sqlState: d.sqlState, error: d.message };
  }
});

ipcMain.handle('test-server', async (event, { serverIp, port }) => {
  const targetPort = port || '3000';
  const targetIp = (serverIp || '127.0.0.1').trim();
  const url = `http://${targetIp}:${targetPort}/api/health`;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.get(url, (res) => {
      const responseTime = Date.now() - startTime;
      if (res.statusCode === 200) {
        resolve({
          success: true,
          message: `Connected to Server PC (${responseTime}ms)!`,
        });
      } else {
        resolve({
          success: false,
          error: `Server responded with HTTP status ${res.statusCode}`,
        });
      }
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: `Could not reach ${targetIp}:${targetPort} (${err.code || err.message})`,
      });
    });

    req.setTimeout(4000, () => {
      req.destroy();
      resolve({
        success: false,
        error: `Connection timed out after 4000ms. Check IP and Windows Firewall.`,
      });
    });
  });
});

ipcMain.handle('save-config', (event, config) => {
  try {
    const configPath = getConfigPath();
    const isServer = config.useMysql === true || config.isServer === true;
    const lines = [
      `USE_MYSQL=${isServer ? 'true' : 'false'}`,
      `SETUP_COMPLETE=true`,
      `DB_HOST=${config.dbHost || '127.0.0.1'}`,
      `DB_PORT=${config.dbPort || '3306'}`,
      `DB_USER=${config.dbUser || 'root'}`,
      `DB_PASSWORD=${config.dbPassword || ''}`,
      `DB_NAME=${config.dbName || 'pharmacy_db'}`,
      `PORT=3000`,
      `SERVER_IP=${config.serverIp || '127.0.0.1'}`,
      `JWT_SECRET=${config.jwtSecret || 'pharmacy_secret_key_change_in_production'}`,
    ];

    // Ensure directory exists for userData in packaged mode
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, lines.join('\n') + '\n', 'utf8');

    // Update in-memory process.env
    process.env.USE_MYSQL = isServer ? 'true' : 'false';
    process.env.SETUP_COMPLETE = 'true';
    process.env.DB_HOST = config.dbHost || '127.0.0.1';
    process.env.DB_PORT = config.dbPort || '3306';
    process.env.DB_USER = config.dbUser || 'root';
    process.env.DB_PASSWORD = config.dbPassword || '';
    process.env.DB_NAME = config.dbName || 'pharmacy_db';
    process.env.PORT = '3000';
    process.env.SERVER_IP = config.serverIp || '127.0.0.1';

    return { success: true };
  } catch (err) {
    console.error('[IPC] save-config error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('launch-app', async (event, payload = {}) => {
  try {
    const isServer = payload.mode ? payload.mode === 'server' : isServerMode();
    if (isServer) {
      console.log('[IPC] Launching app in Server Mode...');
      await startServer();
      await waitForServer(`${getServerUrl()}/api/health`, 30000);
      startPrintService();

      // Handle custom admin password setup if provided
      if (payload.adminPassword && payload.adminPassword.length >= 6) {
        try {
          await fetch(`${getServerUrl()}/api/auth/setup-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: payload.adminPassword }),
          });
          console.log('[IPC] Admin password updated successfully');
        } catch (authErr) {
          console.warn('[IPC] Admin password setup error:', authErr.message);
        }
      }

      // Handle scheduled database restore if provided
      if (pendingRestorePath) {
        await tryRestoreIfPending();
      }

      await launchMainApp();
      return { success: true };
    } else {
      const clientUrl = getServerUrl();
      console.log('[IPC] Launching app in Client Mode connecting to:', clientUrl);
      await waitForServer(`${clientUrl}/api/health`, 6000);
      await launchMainApp();
      return { success: true };
    }
  } catch (err) {
    console.error('[IPC] launch-app error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-setup', () => {
  showSetupPage();
  return { success: true };
});

ipcMain.handle('retry-connection', async () => {
  try {
    if (isServerMode()) {
      await startServer();
      await waitForServer(`${getServerUrl()}/api/health`, 25000);
      startPrintService();
      await launchMainApp();
    } else {
      await waitForServer(`${getServerUrl()}/api/health`, 6000);
      await launchMainApp();
    }
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
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [key, ...valueParts] = trimmed.split('=');
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
  return process.env.SERVER_IP || '127.0.0.1';
});

ipcMain.handle('schedule-restore', (event, filePath) => {
  pendingRestorePath = filePath;
  return { success: true };
});

ipcMain.on('restart-app', () => {
  stopServer();
  app.relaunch();
  app.exit(0);
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

// ---------- Printing (local + Server PC printer bridge) ----------
// The printer may be attached to the Server PC or the Client PC.
// - Server PC Electron runs a small HTTP print service on port 3001 that any
//   Client PC on the LAN can call (GET /printers, POST /print).
// - Client PC Electron merges local + server printers (server ones prefixed
//   with "[Server] ") and forwards print jobs for those to the server.
const PRINT_SERVICE_PORT = 3001;
const SERVER_PRINTER_PREFIX = '[Server] ';
let printService = null;

const PRINT_LOAD_TIMEOUT_MS = 15000; // loading the hidden print window
const PRINT_JOB_TIMEOUT_MS = 30000; // waiting for the webContents.print callback

// Load a URL/file into a (hidden) window and resolve only once it has finished
// loading. Rejects on load failure or timeout so an unresponsive page can never
// hang the caller or leave a window behind.
function loadFileWithTimeout(win, filePath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      win.webContents.removeListener('did-finish-load', onLoad);
      win.webContents.removeListener('did-fail-load', onFail);
      reject(new Error('Print window timed out while loading the bill'));
    }, timeoutMs);

    function onLoad() {
      clearTimeout(timer);
      resolve();
    }
    function onFail(_event, errorCode, errorDesc) {
      clearTimeout(timer);
      reject(new Error(`Print window failed to load (${errorCode} ${errorDesc || ''})`));
    }

    win.webContents.once('did-finish-load', onLoad);
    win.webContents.once('did-fail-load', onFail);
    win.loadFile(filePath).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Measure the rendered bill and return the exact micron page size for the
// selected paper width (58mm / 80mm). Height always tracks the real content so
// longer bills are not truncated and short bills do not produce blank paper.
async function measurePageSize(webContents, paperWidth) {
  const metrics = await webContents.executeJavaScript(
    "({ w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) })"
  );
  const pxToMicrons = (px) => Math.max(352, Math.round(px * 25400 / 96));
  const pageWidthMicrons = paperWidth === '58mm' ? 58000 : 80000;
  const pageHeightMicrons = Math.max(352, pxToMicrons(metrics.h + 16));
  return { pageWidthMicrons, pageHeightMicrons, w: metrics.w, h: metrics.h };
}

async function printHtml({ html, printerName, paperWidth }) {
  console.log(`[PRINT] printHtml called: printerName=${printerName || '(none)'} paperWidth=${paperWidth || '(none)'} htmlLength=${(html || '').length}`);
  let win = null;
  let tempFile = null;

  const fail = (message, code) => ({ success: false, error: message, code });

  // Always release the hidden window + temp file on every path (early returns,
  // exceptions) so no orphaned windows / temp files remain.
  const cleanup = () => {
    if (win && !win.isDestroyed()) {
      try {
        win.destroy();
      } catch {}
    }
    win = null;
    if (tempFile && fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
      tempFile = null;
    }
  };

  try {
    // Render at the real receipt width in a HIDDEN window (no pop-up, no dialog).
    const renderWidth = paperWidth === '58mm' ? 219 : 302; // CSS px (~58/80mm @ 96dpi)
    win = new BrowserWindow({
      show: false,
      width: renderWidth,
      height: 800,
      useContentSize: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    const content = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: 'Courier New', monospace; margin: 0; padding: 8px; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
      </style></head><body>${html}</body></html>`;

    // Unique temp name so rapid, repeated prints can never collide.
    tempFile = path.join(os.tmpdir(), `bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
    fs.writeFileSync(tempFile, content, 'utf8');

    // Wait for the print window to finish loading (honours failure + timeout).
    await loadFileWithTimeout(win, tempFile, PRINT_LOAD_TIMEOUT_MS);

    const { pageWidthMicrons, pageHeightMicrons, w, h } = await measurePageSize(win.webContents, paperWidth);
    console.log(`[PRINT] pageSize ${pageWidthMicrons}x${pageHeightMicrons} microns (content ${w}x${h}px)`);

    // Resolve the target printer. A configured printer (per-PC choice stored in
    // localStorage, or the shared setting) MUST actually exist on THIS computer.
    // We never silently fall back to the default printer and we never claim
    // success for a printer that is not installed.
    if (printerName) {
      const printers = await win.webContents.getPrintersAsync();
      const printerExists = printers.some((p) => p.name === printerName);
      if (!printerExists) {
        cleanup();
        console.error(`[PRINT] Configured printer '${printerName}' not found on this PC. Available: ${printers.map((p) => p.name).join(', ') || '(none)'}`);
        return fail(
          `Printer "${printerName}" is not installed on this PC. Open Settings, refresh the printer list, and choose a printer that is installed on this computer.`,
          'PRINTER_NOT_FOUND'
        );
      }
    }
    const device = printerName || undefined;
    console.log(`[PRINT] Sending to printer: ${device || '(default)'} (silent)`);

    // Callback-based webContents.print() - Electron 26 has no Promise form.
    // Resolve only when Electron reports a result OR on timeout, and report
    // success ONLY when Electron confirms the job was accepted.
    const printResult = await new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(result);
        }
      };
      const timer = setTimeout(() => {
        finish({ success: false, failureReason: 'The printer did not respond in time (print timed out)' });
      }, PRINT_JOB_TIMEOUT_MS);
      try {
        win.webContents.print(
          {
            silent: true,
            deviceName: device,
            copies: 1,
            printBackground: true,
            pageSize: { width: pageWidthMicrons, height: pageHeightMicrons },
            margins: { marginType: 'none' },
          },
          (success, failureReason) => finish({ success: !!success, failureReason })
        );
      } catch (printErr) {
        finish({ success: false, failureReason: printErr.message });
      }
    });

    cleanup();
    if (!printResult.success) {
      const reason = printResult.failureReason || 'unknown reason';
      console.error('[PRINT] Print failed:', reason);
      return fail('Print failed: ' + reason, 'PRINT_FAILED');
    }
    return { success: true };
  } catch (err) {
    console.error('[PRINT] Error:', err.message || err);
    cleanup();
    return fail('Printing error: ' + (err.message || String(err)), 'PRINT_FAILED');
  }
}

async function getLocalPrinters() {
  try {
    const win = new BrowserWindow({ show: false });
    const printers = await win.webContents.getPrintersAsync();
    win.close();
    return printers.map((p) => ({ name: p.name, isDefault: p.isDefault, host: 'local' }));
  } catch (err) {
    return [];
  }
}

function getRemotePrintBase() {
  const serverIp = (process.env.SERVER_IP || '127.0.0.1').trim();
  return `http://${serverIp}:${PRINT_SERVICE_PORT}`;
}

async function fetchServerPrinters() {
  try {
    const res = await fetch(`${getRemotePrintBase()}/printers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const list = await res.json();
    return (list || []).map((p) => ({
      ...p,
      name: `${SERVER_PRINTER_PREFIX}${p.name}`,
      host: 'server',
    }));
  } catch (err) {
    console.warn('[PRINT] Server printer service unreachable:', err.message);
    return [];
  }
}

async function printViaServer(html, printerName, paperWidth) {
  try {
    const res = await fetch(`${getRemotePrintBase()}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, printerName, paperWidth }),
      signal: AbortSignal.timeout(60000),
    });
    return await res.json();
  } catch (err) {
    console.error('[PRINT] Server print service error:', err.message);
    return {
      success: false,
      error: `Cannot reach the print service on the Server PC (${getRemotePrintBase()}). Is the pharmacy app open on the Server PC and is port ${PRINT_SERVICE_PORT} allowed in its firewall?`,
    };
  }
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Runs on the SERVER PC: exposes the local printers to Client PCs over HTTP.
function startPrintService() {
  if (printService) return;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/printers') {
      getLocalPrinters().then((p) => sendJson(res, 200, p));
    } else if (req.method === 'POST' && req.url === '/print') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const result = await printHtml(payload);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { success: false, error: err.message });
        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok' });
    } else {
      sendJson(res, 404, { error: 'Not found' });
    }
  });
  server.on('error', (err) => {
    console.error(`[PRINT-SVC] Failed to bind port ${PRINT_SERVICE_PORT}:`, err.message);
    printService = null;
  });
  server.listen(PRINT_SERVICE_PORT, '0.0.0.0', () => {
    console.log(`[PRINT-SVC] Printer service listening on port ${PRINT_SERVICE_PORT}`);
  });
  printService = server;
}

ipcMain.handle('print-bill', async (event, payload = {}) => {
  console.log(`[PRINT] print-bill IPC received: printerName=${payload?.printerName || '(none)'}`);
  let { html, printerName, paperWidth } = payload;
  // Printers prefixed with "[Server] " belong to the Server PC.
  if (printerName && printerName.startsWith(SERVER_PRINTER_PREFIX)) {
    const serverPrinter = printerName.slice(SERVER_PRINTER_PREFIX.length);
    if (isServerMode()) {
      // We ARE the server PC - just print locally.
      return printHtml({ html, printerName: serverPrinter, paperWidth });
    }
    return printViaServer(html, serverPrinter, paperWidth);
  }
  return printHtml({ html, printerName, paperWidth });
});

ipcMain.handle('get-printers', async () => {
  const local = await getLocalPrinters();
  if (isServerMode()) return local;
  // Client PC: also offer the Server PC's printers.
  const remote = await fetchServerPrinters();
  return [...local, ...remote];
});

module.exports = { getConfigPath };
