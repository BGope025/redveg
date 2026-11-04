const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth.middleware');
const { uploadMiddleware, handleUploadError } = require('../../../middleware/upload.middleware');
const {
  uploadProductImage,
  uploadUiAsset
} = require('./media.controller');

// Protected routes - admin only for uploads
router.use(protect);
router.use(authorize('admin'));

// Product image upload
router.post('/upload/products', uploadMiddleware.single('image'), handleUploadError, uploadProductImage);

// UI asset upload (banners, logos, etc.)
router.post('/upload/ui', uploadMiddleware.single('file'), handleUploadError, uploadUiAsset);

module.exports = router;

