const express = require('express');
const { protect, authorize } = require('../../../../middleware/auth.middleware');
const { getActiveCustomerCarts, exportCustomerCarts } = require('./customer-carts.controller');

const router = express.Router();
router.use(protect, authorize('admin'));
router.get('/', getActiveCustomerCarts);
router.get('/export', exportCustomerCarts);

module.exports = router;
