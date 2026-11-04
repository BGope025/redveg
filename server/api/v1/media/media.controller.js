const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Jimp } = require('jimp');
const { generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');

const uploadRoot = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads'));
async function storeImage(file, folder, baseUrl) {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.mimetype)) throw generateValidationError('Only JPEG, PNG, and WebP images are allowed');
  const extensionByMimeType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  let imageBuffer = file.buffer;
  if (file.mimetype === 'image/webp') {
    if (file.buffer.toString('ascii', 0, 4) !== 'RIFF' || file.buffer.toString('ascii', 8, 12) !== 'WEBP') {
      throw generateValidationError('The selected file is not a valid WebP image');
    }
  } else {
    let image;
    try {
      image = await Jimp.read(file.buffer);
    } catch {
      throw generateValidationError('Choose a valid JPEG or PNG image');
    }
    if (image.bitmap.width > 2000 || image.bitmap.height > 2000) {
      image.scaleToFit({ w: 2000, h: 2000 });
    }
    imageBuffer = await image.getBuffer(file.mimetype, file.mimetype === 'image/jpeg' ? { quality: 82 } : undefined);
  }
  const directory = path.join(uploadRoot, folder);
  await fs.mkdir(directory, { recursive: true, mode: 0o755 });
  // systemd runs this service with UMask=0077, which would otherwise make
  // uploaded images unreadable to Nginx even when writeFile's mode is 0644.
  await fs.chmod(directory, 0o755);
  const filename = `${crypto.randomUUID()}.${extensionByMimeType[file.mimetype]}`;
  const imagePath = path.join(directory, filename);
  await fs.writeFile(imagePath, imageBuffer, { flag: 'wx', mode: 0o644 });
  await fs.chmod(imagePath, 0o644);
  const relativeUrl = `/uploads/${folder}/${filename}`;
  return { url: `${baseUrl}${relativeUrl}`, key: `${folder}/${filename}` };
}

function getPublicBaseUrl(req) {
  const configured = String(process.env.APP_PUBLIC_URL || '').replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

/**
 * Save an optimized product image to VPS storage
 * @route POST /api/v1/media/upload/products
 */
const uploadProductImage = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw generateValidationError('No file uploaded');
    }

    const uploadResult = await storeImage(req.file, 'products', getPublicBaseUrl(req));

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
      message: 'Image could not be saved to server storage'
    });
  }
};

/**
 * Save an optimized campaign/UI image to VPS storage
 * @route POST /api/v1/media/upload/ui
 */
const uploadUiAsset = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw generateValidationError('No file uploaded');
    }

    const uploadResult = await storeImage(req.file, 'ui', getPublicBaseUrl(req));

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
      message: 'Image could not be saved to server storage'
    });
  }
};

module.exports = {
  uploadProductImage,
  uploadUiAsset
};
