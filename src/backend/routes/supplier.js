const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const supplier = require('../controllers/supplier');

router.get('/', requireAuth, supplier.listSuppliers);
router.post('/', requireAuth, requireAdmin, supplier.createSupplier);
router.put('/:id', requireAuth, requireAdmin, supplier.updateSupplier);
router.delete('/:id', requireAuth, requireAdmin, supplier.deleteSupplier);
router.get('/:id/profile', requireAuth, requireAdmin, supplier.getSupplierProfile);
router.get('/:id/products', requireAuth, requireAdmin, supplier.getSupplierProducts);

module.exports = router;
