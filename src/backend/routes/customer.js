const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const customer = require('../controllers/customer');

router.post('/', requireAuth, customer.createCustomer);
router.get('/search', requireAuth, customer.searchCustomers);
router.get('/', requireAuth, customer.listCustomers);
router.get('/:id', requireAuth, customer.getCustomer);
router.get('/:id/history', requireAuth, customer.getCustomerHistory);
router.get('/:id/last-purchase', requireAuth, customer.getCustomerLastPurchase);
router.put('/:id', requireAuth, requireAdmin, customer.updateCustomer);
router.post('/deactivate/:id', requireAuth, requireAdmin, customer.deactivateCustomer);

module.exports = router;
