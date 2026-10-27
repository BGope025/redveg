const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const { generateVariantId } = require('../../../utils/id-generator');
const { normalizePieceSize } = require('./variants.schema');
const logger = require('../../../utils/logger');

const isPlaceholderVariantName = (value) =>
  typeof value !== 'string' || !value.trim() || /^new\s+(size|variant)$/i.test(value.trim()) || /^standard(?:\s.*)?$/i.test(value.trim());

/**
 * Get all variants for a product
 * @route GET /api/v1/products/:productId/variants
 */
const getVariantsByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const db = await getDatabaseConnection('catalog');

    // Check if product exists
    const productResult = await db.execute({
      sql: 'SELECT id FROM products WHERE id = ?',
      args: [productId]
    });

    if (productResult.rows.length === 0) {
      throw generateNotFoundError('Product not found');
    }

    const result = await db.execute({
      sql: 'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at ASC',
      args: [productId]
    });

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching variants:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAllAdminVariants = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    const result = await db.execute(`
      SELECT TRIM(v.id) AS id, TRIM(v.product_id) AS product_id, v.sku, v.size, v.weight, v.piece_size, v.price, v.stock_count, v.is_available, p.name AS product_name
      FROM variants v
      LEFT JOIN products p ON p.id = v.product_id
      ORDER BY v.id ASC, v.sku ASC
    `);
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    logger.error('Error fetching all admin variants:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get variant by ID
 * @route GET /api/v1/variants/:id
 */
const getVariantById = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('catalog');

    const result = await db.execute({
      sql: 'SELECT v.*, p.name as product_name FROM variants v JOIN products p ON v.product_id = p.id WHERE v.id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('Variant not found');
    }

    const variant = result.rows[0];

    res.status(200).json({
      success: true,
      data: variant
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching variant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create new variant for a product
 * @route POST /api/v1/products/:productId/variants
 */
const createVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const { sku, weight, price, stock_count, is_available } = req.body;
    const requestedName = req.body?.variant_name ?? req.body?.size;
    const variantName = typeof requestedName === 'string' ? requestedName.trim() : '';
    const rawPieceSize = req.body?.piece_size ?? req.body?.pieceSize;
    const pieceSize = normalizePieceSize(rawPieceSize);

    // Validate required fields
    if (!String(sku || '').trim() || !variantName || price == null || String(price).trim() === '' || stock_count == null || String(stock_count).trim() === '') {
      throw generateValidationError('SKU, variant name, price, and stock_count are required');
    }
    if (isPlaceholderVariantName(variantName)) {
      throw generateValidationError('Enter a real variant name; placeholder names are not allowed');
    }
    if (rawPieceSize != null && String(rawPieceSize).trim() !== '' && !pieceSize) {
      throw generateValidationError('Piece size must be Small, Medium, or Large');
    }

    // Validate price and stock_count are non-negative
    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      throw generateValidationError('Price must be a valid non-negative number');
    }
    if (!Number.isInteger(Number(stock_count)) || Number(stock_count) < 0) {
      throw generateValidationError('Stock count must be a valid non-negative number');
    }

    const db = await getDatabaseConnection('catalog');

    // Check if product exists
    const productResult = await db.execute({
      // Admins must be able to add/edit inventory on a currently hidden
      // product. Product visibility is controlled separately from stock.
      sql: 'SELECT id FROM products WHERE id = ?',
      args: [productId]
    });

    if (productResult.rows.length === 0) {
      throw generateNotFoundError('Product not found');
    }

    // Check if SKU already exists
    const skuResult = await db.execute({
      sql: 'SELECT id FROM variants WHERE sku = ?',
      args: [String(sku).trim()]
    });

    if (skuResult.rows.length > 0) {
      throw generateValidationError('SKU already exists');
    }

    const variantId = generateVariantId();

    await db.execute({
      sql: `
        INSERT INTO variants (id, product_id, sku, size, weight, piece_size, price, stock_count, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [variantId, productId, String(sku).trim(), variantName, weight || null, pieceSize, Number(price), Number(stock_count), is_available === false || is_available === 0 ? 0 : 1]
    });

    const savedVariant = await db.execute({
      sql: 'SELECT id, product_id, sku, size, weight, piece_size, price, stock_count, is_available FROM variants WHERE id = ?',
      args: [variantId]
    });
    if (!savedVariant.rows.length) throw new Error('Variant was not returned after saving');

    logger.info(`Variant created: ${variantId} for product: ${productId}`);

    res.status(201).json({
      success: true,
      message: 'Variant created successfully',
      data: savedVariant.rows[0]
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'not-found') {
      return res.status(404).json({ success: false, message: error.message });
    }

    logger.error('Error creating variant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update variant
 * @route PUT /api/v1/variants/:id
 */
const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, weight, price, stock_count, is_available } = req.body;
    const requestedName = req.body?.variant_name ?? req.body?.size;
    const rawPieceSize = req.body?.piece_size ?? req.body?.pieceSize;

    const db = await getDatabaseConnection('catalog');

    // Check if variant exists
    const variantResult = await db.execute({
      sql: 'SELECT id FROM variants WHERE id = ?',
      args: [id]
    });

    if (variantResult.rows.length === 0) {
      throw generateNotFoundError('Variant not found');
    }

    // Build update query dynamically
    const updates = [];
    const args = [];
    if (rawPieceSize !== undefined) {
      const pieceSize = normalizePieceSize(rawPieceSize);
      if (rawPieceSize != null && String(rawPieceSize).trim() !== '' && !pieceSize) {
        throw generateValidationError('Piece size must be Small, Medium, or Large');
      }
      updates.push('piece_size = ?');
      args.push(pieceSize);
    }

    if (sku !== undefined) {
      // Check if SKU already exists (excluding current variant)
      if (sku !== null && sku !== '') {
        const skuCheckResult = await db.execute({
          sql: 'SELECT id FROM variants WHERE sku = ? AND id != ?',
          args: [sku, id]
        });

        if (skuCheckResult.rows.length > 0) {
          throw generateValidationError('SKU already exists');
        }
      }

      updates.push('sku = ?');
      args.push(sku);
    }

    if (requestedName !== undefined) {
      if (isPlaceholderVariantName(requestedName)) {
        throw generateValidationError('Enter a real variant name; placeholder names are not allowed');
      }
      updates.push('size = ?');
      args.push(requestedName.trim());
    }

    if (weight !== undefined) {
      updates.push('weight = ?');
      args.push(weight);
    }

    if (price !== undefined) {
      if (price == null || String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0) {
        throw generateValidationError('Price must be a valid non-negative number');
      }
      updates.push('price = ?');
      args.push(Number(price));
    }

    if (stock_count !== undefined) {
      if (stock_count == null || String(stock_count).trim() === '' || !Number.isInteger(Number(stock_count)) || Number(stock_count) < 0) {
        throw generateValidationError('Stock count must be non-negative');
      }
      updates.push('stock_count = ?');
      args.push(Math.floor(Number(stock_count)));
    }

    if (is_available !== undefined) {
      if (![true, false, 0, 1].includes(is_available)) {
        throw generateValidationError('Availability must be true or false');
      }
      updates.push('is_available = ?');
      args.push(is_available === true || is_available === 1 ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    args.push(id);

    await db.execute({
      sql: `UPDATE variants SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    const savedVariant = await db.execute({
      sql: 'SELECT id, product_id, sku, size, weight, piece_size, price, stock_count, is_available FROM variants WHERE id = ?',
      args: [id]
    });
    if (!savedVariant.rows.length) throw generateNotFoundError('Variant not found');

    logger.info(`Variant updated: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Variant updated successfully',
      data: savedVariant.rows[0]
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error updating variant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete variant
 * @route DELETE /api/v1/variants/:id
 */
const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('catalog');

    // Check if variant exists
    const variantResult = await db.execute({
      sql: 'SELECT id FROM variants WHERE id = ?',
      args: [id]
    });

    if (variantResult.rows.length === 0) {
      throw generateNotFoundError('Variant not found');
    }

    await db.execute({
      sql: 'DELETE FROM variants WHERE id = ?',
      args: [id]
    });

    logger.info(`Variant deleted: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Variant deleted successfully'
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error deleting variant:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getAllAdminVariants,
  getVariantsByProductId,
  getVariantById,
  createVariant,
  updateVariant,
  deleteVariant
};


