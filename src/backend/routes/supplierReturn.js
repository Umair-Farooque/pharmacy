const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const supplierReturn = require('../controllers/supplierReturn');

router.post('/', requireAuth, requireAdmin, supplierReturn.processSupplierReturn);
router.get('/', requireAuth, requireAdmin, supplierReturn.listSupplierReturns);

module.exports = router;
