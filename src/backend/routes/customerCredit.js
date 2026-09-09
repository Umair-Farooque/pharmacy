const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const customerCredit = require('../controllers/customerCredit');

router.post('/:id/credit-sale', requireAuth, requireAdmin, customerCredit.recordCreditSale);
router.post('/:id/payment', requireAuth, customerCredit.recordPayment);
router.get('/:id/credit-history', requireAuth, customerCredit.getCustomerCreditHistory);
router.get('/:id/credit-summary', requireAuth, customerCredit.getCustomerCreditSummary);
router.post('/:id/adjust-credit', requireAuth, requireAdmin, customerCredit.adjustCredit);
router.get('/credit/report', requireAuth, customerCredit.getCreditReport);

module.exports = router;
