const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const sale = require('../controllers/sale');

router.post('/', requireAuth, sale.createSale);
router.get('/', requireAuth, sale.listSales);
router.get('/bill/:bill_number', requireAuth, sale.getSaleByBillNumber);
router.get('/:id', requireAuth, sale.getSale);
router.get('/:id/returnable-items', requireAuth, sale.getReturnableItems);
router.post('/return', requireAuth, sale.processReturn);
router.get('/search/:bill_number', requireAuth, sale.searchSaleByBillNumber);

module.exports = router;
