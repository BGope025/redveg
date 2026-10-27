const express = require('express');
const router = express.Router();
const { login, logout, validate } = require('./auth.controller');
const { googleLogin } = require('./oauth.controller');
const { requestPasswordReset, requestEmployeePasswordChange, confirmPasswordReset } = require('./password-reset.controller');
const { protect } = require('../../../middleware/auth.middleware');

// Auth routes
router.post('/login', login);
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/employee-request', requestEmployeePasswordChange);
router.post('/password-reset/confirm', confirmPasswordReset);
router.post('/oauth/google', googleLogin);
router.post('/logout', logout);
router.get('/validate', protect, validate); // Validate active staff session and permissions

module.exports = router;
