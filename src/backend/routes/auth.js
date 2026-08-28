const express = require('express');
const router = express.Router();
const { login, changePassword } = require('../controllers/auth');
const { requireAuth } = require('../middleware');

router.post('/login', login);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;
