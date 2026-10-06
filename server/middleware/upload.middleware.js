const multer = require('multer');
const { generateValidationError } = require('../utils/error-classes');
const { maxFileSize } = require('../config/env');
const Jimp = require('jimp');

/**
 * Multer storage configuration - memory storage with 5MB limit
 */
const storage = multer.memoryStorage();

/**
 * File filter - only allow images
 */
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new generateValidationError('Only image files are allowed'), false);
  }
};

/**
 * Multer upload instance with limits
 */
const uploadMiddleware = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: maxFileSize * 1024 * 1024 // Convert MB to bytes
  }
});

/**
 * Middleware to handle multer errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File size exceeds the limit of ${maxFileSize}MB`
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  } else if (err) {
    // Handle custom validation errors
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  // No error, continue
  next();
};

/**
 * Middleware to process uploaded image with jimp
 * Converts to WebP and reduces quality for optimization
 */
const processImage = async (req, res, next) => {
  try {
    // Only process if file exists and is an image
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return next();
    }

    // Process image with jimp: convert to WebP, quality 80
    const image = await Jimp.read(req.file.buffer);
    await image.quality(80);
    const processedBuffer = await image.getBufferAsync(Jimp.MIME_WEBP);

    // Replace original buffer with processed one
    req.file.buffer = processedBuffer;
    req.file.mimetype = 'image/webp';

    // Update file extension in originalname for reference
    req.file.originalname = req.file.originalname.replace(/\.[^/.]+$/, '') + '.webp';

    next();
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing image'
    });
  }
};

module.exports = {
  uploadMiddleware,
  handleUploadError,
  processImage
};