const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { getAllCategories, getAdminCategories, createCategory, updateCategoryImage, setCategoryStatus, deleteCategory } = require('./categories.controller');

// Public routes - categories don't require authentication
router.get('/admin', protect, authorize('admin'), getAdminCategories);
router.post('/admin', protect, authorize('admin'), createCategory);
router.patch('/admin/:slug/image', protect, authorize('admin'), updateCategoryImage);
router.patch('/admin/:slug/status', protect, authorize('admin'), setCategoryStatus);
router.delete('/admin/:slug', protect, authorize('admin'), deleteCategory);
router.get('/', getAllCategories);

module.exports = router;


