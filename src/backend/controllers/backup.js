const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { logAudit } = require('../middleware');

function getBackupDir() {
  return path.resolve(__dirname, '../../..', 'backups');
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacy_db',
  };
}

function mysqlCommand() {
  const cfg = getDbConfig();
  const args = [`-h${cfg.host}`, `-P${cfg.port}`, `-u${cfg.user}`, `-p${cfg.password}`, cfg.database];
  return args;
}

function mysqldumpCommand() {
  const cfg = getDbConfig();
  const args = [`-h${cfg.host}`, `-P${cfg.port}`, `-u${cfg.user}`, `-p${cfg.password}`, cfg.database];
  return args;
}

function scanBackupFiles(backupDir) {
  try {
    if (!fs.existsSync(backupDir)) return [];
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('pharmacy_backup_') && f.endsWith('.sql'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return { filename: f, size: stat.size, created_at: stat.birthtime.toISOString() };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return files;
  } catch (err) {
    console.error('[BACKUP] Scan error:', err.message);
    return [];
  }
}

async function getBackupStatus(req, res) {
  try {
    const [settingRows] = await db.query("SELECT `key`, value FROM settings WHERE `key` IN ('backup_enabled','backup_time','backup_dir','backup_retention')");
    const settings = {};
    settingRows.forEach(row => { settings[row.key] = row.value; });

    const backupDir = getBackupDir();
    const files = scanBackupFiles(backupDir);

    res.json({
      enabled: settings.backup_enabled === '1' || settings.backup_enabled === 'true',
      backup_time: settings.backup_time || '02:00',
      backup_dir: backupDir,
      retention_count: parseInt(settings.backup_retention) || 30,
      last_backup_at: files.length > 0 ? files[0].created_at : null,
      last_backup_file: files.length > 0 ? files[0].filename : null,
      backup_count: files.length,
    });
  } catch (err) {
    console.error('[BACKUP] Status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createBackup(req, res) {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `pharmacy_backup_${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);
    const args = mysqldumpCommand();

    const mysqldump = spawn('mysqldump', args);

    const writeStream = fs.createWriteStream(filepath);
    mysqldump.stdout.pipe(writeStream);

    let stderr = '';
    mysqldump.stderr.on('data', d => { stderr += d.toString(); });

    mysqldump.on('close', async code => {
      if (code !== 0) {
        try { fs.unlinkSync(filepath); } catch (e) {}
        await logAudit(req.user.id, 'BACKUP_FAILED', null, null, { error: stderr || 'mysqldump exited with code ' + code });
        return res.status(500).json({ error: 'Backup failed: ' + (stderr || 'mysqldump error').trim() });
      }
      try {
        const stat = fs.statSync(filepath);
        await logAudit(req.user.id, 'BACKUP_CREATED', null, null, { file: filename, size: stat.size });
        res.json({ success: true, file: filename, size: stat.size, timestamp: new Date().toISOString() });
      } catch (err) {
        res.status(500).json({ error: 'Backup completed but could not read file' });
      }
    });

    mysqldump.on('error', async err => {
      try { fs.unlinkSync(filepath); } catch (e) {}
      await logAudit(req.user.id, 'BACKUP_FAILED', null, null, { error: err.message });
      res.status(500).json({ error: 'Failed to start mysqldump. Is it installed and in PATH?' });
    });
  } catch (err) {
    console.error('[BACKUP] Create error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function restoreBackup(req, res) {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename is required' });

  try {
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, filename);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup file not found' });

    const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const safetyFile = path.join(backupDir, `pre_restore_backup_${safetyTimestamp}.sql`);

    const mysqldump = spawn('mysqldump', mysqldumpCommand());
    const safetyStream = fs.createWriteStream(safetyFile);
    mysqldump.stdout.pipe(safetyStream);

    let safetyStderr = '';
    mysqldump.stderr.on('data', d => { safetyStderr += d.toString(); });

    await new Promise((resolve, reject) => {
      mysqldump.on('close', code => {
        if (code !== 0) {
          try { fs.unlinkSync(safetyFile); } catch (e) {}
          reject(new Error(safetyStderr || 'Safety backup failed (code ' + code + ')'));
        } else {
          resolve();
        }
      });
      mysqldump.on('error', err => {
        try { fs.unlinkSync(safetyFile); } catch (e) {}
        reject(err);
      });
    });

    const mysqlArgs = mysqlCommand();
    const mysqlProc = spawn('mysql', mysqlArgs);
    const readStream = fs.createReadStream(backupPath);
    readStream.pipe(mysqlProc.stdin);

    let mysqlStderr = '';
    mysqlProc.stderr.on('data', d => { mysqlStderr += d.toString(); });

    mysqlProc.on('close', async code => {
      if (code !== 0) {
        await logAudit(req.user.id, 'RESTORE_FAILED', null, null, { error: mysqlStderr || 'mysql exited with code ' + code, file: filename });
        return res.status(500).json({ error: 'Restore failed: ' + (mysqlStderr || 'mysql error').trim() });
      }
      await logAudit(req.user.id, 'RESTORE_COMPLETED', null, null, { file: filename, safety_backup: path.basename(safetyFile) });
      res.json({ success: true, message: 'Database restored successfully' });
    });

    mysqlProc.on('error', async err => {
      await logAudit(req.user.id, 'RESTORE_FAILED', null, null, { error: err.message, file: filename });
      res.status(500).json({ error: 'Failed to start mysql. Is it installed and in PATH?' });
    });
  } catch (err) {
    console.error('[BACKUP] Restore error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listBackups(req, res) {
  try {
    const backupDir = getBackupDir();
    const files = scanBackupFiles(backupDir);
    res.json(files);
  } catch (err) {
    console.error('[BACKUP] List error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteBackup(req, res) {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename is required' });

  try {
    const backupDir = getBackupDir();
    const filepath = path.join(backupDir, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup file not found' });
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (err) {
    console.error('[BACKUP] Delete error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getBackupStatus, createBackup, restoreBackup, listBackups, deleteBackup };
