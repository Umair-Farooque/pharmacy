const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.post('/save-config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Config required' });
    }

    const configPath = path.join(__dirname, '../../.env');
    const lines = [
      `USE_MYSQL=true`,
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
    res.json({ success: true });
  } catch (err) {
    console.error('[CONFIG] Save error:', err.message);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

module.exports = router;
