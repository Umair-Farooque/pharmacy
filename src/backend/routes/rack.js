const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const rack = require('../controllers/rack');

router.get('/', requireAuth, rack.listRacks);
router.post('/', requireAuth, requireAdmin, rack.createRack);
router.put('/:id', requireAuth, requireAdmin, rack.updateRack);
router.delete('/:id', requireAuth, requireAdmin, rack.deleteRack);

module.exports = router;
