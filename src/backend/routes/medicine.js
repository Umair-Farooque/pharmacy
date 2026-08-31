const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const medicine = require('../controllers/medicine');

router.get('/', requireAuth, medicine.listMedicines);
router.get('/categories', requireAuth, medicine.getCategories);
router.get('/:id', requireAuth, medicine.getMedicine);
router.post('/', requireAuth, requireAdmin, medicine.createMedicine);
router.put('/:id', requireAuth, requireAdmin, medicine.updateMedicine);
router.put('/:id/price', requireAuth, requireAdmin, medicine.updateMedicinePrice);
router.delete('/:id', requireAuth, requireAdmin, medicine.deleteMedicine);

module.exports = router;
