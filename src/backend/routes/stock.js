const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const stock = require('../controllers/stock');

router.post('/restock', requireAuth, requireAdmin, stock.restock);
router.post('/adjust', requireAuth, requireAdmin, stock.adjustStock);
router.post('/mark-expired', requireAuth, requireAdmin, stock.markExpired);
router.get('/low-stock', requireAuth, stock.getLowStock);
router.get('/expiring-soon', requireAuth, stock.getExpiringSoon);

module.exports = router;
