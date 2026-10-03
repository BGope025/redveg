const express = require('express');
const router = express.Router();
const { requireCouponAdmin } = require('./coupons.middleware');
const {
  getCoupons,
  getActiveCoupons,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
} = require('./coupons.controller');

// Storefront-safe feed: only active, in-date coupons with remaining usage.
router.post('/validate', validateCoupon);
router.get('/active', getActiveCoupons);

// All coupon management is restricted to admins.
router.use(requireCouponAdmin);
router.get('/', getCoupons);
router.post('/', createCoupon);
router.patch('/:id', updateCoupon);
router.delete('/:id', deactivateCoupon);

module.exports = router;
