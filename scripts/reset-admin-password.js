// Emergency admin password reset for the packaged (or dev) pharmacy app.
// Usage:
//   node reset-admin-password.js <newPassword> [username]
// Finds DB settings from the packaged config.env (%APPDATA%\Al-Hafiz Pharmacy\config.env),
// the local .env, or DB_* environment variables, then resets the user's password.
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadConfigFile(file) {
  const cfg = {};
  if (!fs.existsSync(file)) return cfg;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const [k, ...v] = t.split('=');
    if (k && v.length) cfg[k.trim()] = v.join('=').trim();
  });
  return cfg;
}

const candidates = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'Al-Hafiz Pharmacy', 'config.env'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'pharmacy-management', 'config.env'),
  path.join(__dirname, '..', '.env'),
];

let cfg = { ...process.env };
for (const file of candidates) {
  const parsed = loadConfigFile(file);
  if (parsed.DB_NAME || parsed.DB_HOST) {
    cfg = { ...cfg, ...parsed };
    console.log(`[RESET] Loaded DB settings from: ${file}`);
    break;
  }
}

const newPassword = process.argv[2];
const username = process.argv[3] || 'admin';
if (!newPassword || newPassword.length < 6) {
  console.error('Usage: node reset-admin-password.js <newPassword (min 6 chars)> [username=admin]');
  process.exit(1);
}

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const conn = await mysql.createConnection({
    host: cfg.DB_HOST || '127.0.0.1',
    port: parseInt(cfg.DB_PORT) || 3306,
    user: cfg.DB_USER || 'root',
    password: cfg.DB_PASSWORD || '',
    database: cfg.DB_NAME || 'pharmacy_db',
    connectTimeout: 8000,
  });
  const hash = await bcrypt.hash(newPassword, 10);
  const [result] = await conn.query(
    'UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?',
    [hash, username]
  );
  await conn.end();
  if (result.affectedRows === 0) {
    console.error(`[RESET] User '${username}' not found.`);
    process.exit(1);
  }
  console.log(`[RESET] Password for '${username}' has been reset successfully.`);
  console.log('[RESET] You can now log in with that password.');
  process.exit(0);
})().catch(err => {
  console.error('[RESET] Failed:', err.message);
  process.exit(1);
});
