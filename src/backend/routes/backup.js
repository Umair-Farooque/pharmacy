const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const backup = require('../controllers/backup');

router.get('/status', requireAuth, requireAdmin, backup.getBackupStatus);
router.post('/create', requireAuth, requireAdmin, backup.createBackup);
router.post('/restore', requireAuth, requireAdmin, backup.restoreBackup);
router.get('/list', requireAuth, requireAdmin, backup.listBackups);
router.delete('/:filename', requireAuth, requireAdmin, backup.deleteBackup);

module.exports = router;
