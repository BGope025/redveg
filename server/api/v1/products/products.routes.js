const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProductById
} = require('./products.controller');
const { getProductReviews, saveProductReview } = require('./product-reviews.controller');
const { authenticateFirebaseCustomer, optionalFirebaseCustomer } = require('../../../middleware/firebase-customer-auth.middleware');

// Public routes (Storefront)
router.get('/', getAllProducts);
router.get('/:id/reviews', optionalFirebaseCustomer, getProductReviews);
router.post('/:id/reviews', authenticateFirebaseCustomer, saveProductReview);
router.get('/:id', getProductById);

module.exports = router;
