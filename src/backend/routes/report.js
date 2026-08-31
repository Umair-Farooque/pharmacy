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
router.get('/purchase-history', requireAuth, requireAdmin, report.getPurchaseHistory);
router.get('/stock-movements', requireAuth, requireAdmin, report.getStockMovements);
router.get('/returns', requireAuth, requireAdmin, report.getReturns);
router.get('/audit-log', requireAuth, requireAdmin, report.getAuditLog);
router.get('/profit-loss', requireAuth, requireAdmin, report.getProfitLoss);
router.get('/category-sales', requireAuth, requireAdmin, report.getCategorySales);
router.get('/user-activity', requireAuth, requireAdmin, report.getUserActivity);
router.get('/batches', requireAuth, requireAdmin, report.getBatches);

module.exports = router;
