const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const setting = require('../controllers/setting');

router.get('/', requireAuth, setting.getSettings);
router.put('/', requireAuth, requireAdmin, setting.updateSettings);

module.exports = router;
