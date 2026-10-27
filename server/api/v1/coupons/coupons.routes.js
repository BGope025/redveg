const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { optionalFirebaseCustomer } = require('../../../middleware/firebase-customer-auth.middleware');
const {
  getCoupons,
  getActiveCoupons,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
} = require('./coupons.controller');

// Storefront-safe feed: only active, in-date coupons with remaining usage.
router.post('/validate', optionalFirebaseCustomer, validateCoupon);
router.get('/active', getActiveCoupons);

// Management uses the central live staff-session and permission checks.
router.use(protect, authorize('admin'));
router.get('/', getCoupons);
router.post('/', createCoupon);
router.patch('/:id', updateCoupon);
router.delete('/:id', deactivateCoupon);

module.exports = router;
