const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware');
const user = require('../controllers/user');

router.get('/', requireAuth, requireAdmin, user.listUsers);
router.post('/', requireAuth, requireAdmin, user.createUser);
router.put('/:id', requireAuth, requireAdmin, user.updateUser);
router.post('/:id/reset-password', requireAuth, requireAdmin, user.resetPassword);
router.delete('/:id', requireAuth, requireAdmin, user.deleteUser);

module.exports = router;
