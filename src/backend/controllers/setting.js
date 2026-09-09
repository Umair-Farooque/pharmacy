const db = require('../db');
const { logAudit, captureBeforeAfter, logAuditWithBeforeAfter } = require('../middleware');

async function getSettings(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateSettings(req, res) {
  const updates = req.body;
  try {
    const [existingRows] = await db.query('SELECT `key`, value FROM settings');
    const beforeMap = {};
    existingRows.forEach(row => { beforeMap[row.key] = row.value; });

    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, value]
      );
    }

    const changedKeys = Object.keys(updates);
    const before = {};
    const after = {};
    changedKeys.forEach(key => {
      before[key] = beforeMap[key] !== undefined ? beforeMap[key] : null;
      after[key] = updates[key];
    });

    await logAuditWithBeforeAfter(req.user.id, 'SETTINGS_CHANGED', 'settings', null, before, after);
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getSettings, updateSettings };
