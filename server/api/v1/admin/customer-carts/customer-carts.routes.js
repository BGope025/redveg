const express = require('express');
const { protect, authorize } = require('../../../../middleware/auth.middleware');
const { getActiveCustomerCarts } = require('./customer-carts.controller');

const router = express.Router();
router.use(protect, authorize('admin'));
router.get('/', getActiveCustomerCarts);

module.exports = router;
