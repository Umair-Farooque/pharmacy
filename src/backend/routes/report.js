const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const report = require('../controllers/report');

router.get('/dashboard', requireAuth, report.getDashboard);
router.get('/sales', requireAuth, report.getSalesReport);
router.get('/day-summary/:date', requireAuth, report.getDaySummary);
router.get('/day-summary', requireAuth, report.getDaySummary);
router.get('/stock-valuation', requireAuth, requireAdmin, report.getStockValuation);
router.get('/profit-margins', requireAuth, requireAdmin, report.getProfitMargins);
router.get('/expiry-alerts', requireAuth, report.getExpiryAlerts);
router.get('/low-stock', requireAuth, report.getLowStockAlerts);

module.exports = router;
