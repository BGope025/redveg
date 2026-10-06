const { uploadToCloudinary } = require('../../../services/image.service');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');

/**
 * Upload product image to Cloudinary
 * @route POST /api/v1/media/upload/products
 */
const uploadProductImage = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw generateValidationError('No file uploaded');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      throw generateValidationError('Only JPEG, PNG, and WebP images are allowed');
    }

    // Upload to Cloudinary (file is already processed by jimp in upload.middleware)
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'products', req.file.mimetype);

    logger.info(`Product image uploaded: ${uploadResult.key}`);

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: uploadResult.url,
        key: uploadResult.key
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error uploading product image:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Upload UI asset to Cloudinary
 * @route POST /api/v1/media/upload/ui
 */
const uploadUiAsset = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw generateValidationError('No file uploaded');
    }

    // Validate file type (allow more types for UI assets)
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/svg+xml', 'application/json'
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      throw generateValidationError('Invalid file type');
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'ui', req.file.mimetype);

    logger.info(`UI asset uploaded: ${uploadResult.key}`);

    res.status(200).json({
      success: true,
      message: 'Asset uploaded successfully',
      data: {
        url: uploadResult.url,
        key: uploadResult.key
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error uploading UI asset:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  uploadProductImage,
  uploadUiAsset
};