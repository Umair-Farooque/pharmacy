const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const purchase = require('../controllers/purchase');

router.post('/invoices', requireAuth, requireAdmin, purchase.createPurchaseInvoice);
router.get('/invoices', requireAuth, requireAdmin, purchase.listPurchaseInvoices);
router.get('/invoices/:id', requireAuth, requireAdmin, purchase.getPurchaseInvoice);

module.exports = router;
