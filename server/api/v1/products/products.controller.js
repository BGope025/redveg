const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');
const { generateProductId } = require('../../../utils/id-generator');

function slugify(text) {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function mapProduct(row, variants = []) {
  const mappedVariants = variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    label: [variant.size, variant.weight].filter(Boolean).join(' / ') || variant.sku,
    size: variant.size || null,
    weight: variant.weight || null,
    price: Number(variant.price),
    stock: Number(variant.stock_count || 0),
    stockCount: Number(variant.stock_count || 0),
    available: Number(variant.stock_count || 0) > 0
  }));
  const totalStock = mappedVariants.reduce((sum, variant) => sum + variant.stock, 0);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || slugify(row.name),
    description: row.description || '',
    shortDescription: row.short_description || row.description || '',
    category: row.category,
    image: row.image_url || null,
    imageUrl: row.image_url || null,
    isActive: Boolean(row.is_active) && totalStock > 0,
    rating: row.rating == null ? null : Number(row.rating),
    variants: mappedVariants
  };
}

/**
 * Get all active products for Storefront
 */
const getAllProducts = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    const category = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const search = req.query.q ? req.query.q.trim() : '';
    const sort = req.query.sort || 'popular';
    const limit = parseInt(req.query.limit, 10) || null;
    const offset = parseInt(req.query.offset, 10) || 0;

    let categoryFilter = '';
    const args = [];
    if (category && category !== 'all') {
      categoryFilter += " AND LOWER(TRIM(p.category)) = LOWER(TRIM(?))";
      args.push(category);
    }

    if (search) {
      categoryFilter += " AND (p.name LIKE ? OR p.description LIKE ?)";
      args.push(`%${search}%`, `%${search}%`);
    }

    let sortClause = 'p.created_at DESC';
    if (sort === 'price-low') {
      sortClause = '(SELECT MIN(price) FROM variants WHERE product_id = p.id) ASC';
    } else if (sort === 'price-high') {
      sortClause = '(SELECT MAX(price) FROM variants WHERE product_id = p.id) DESC';
    } else if (sort === 'rating') {
      sortClause = 'p.rating DESC, p.created_at DESC';
    }

    let sql = `
      SELECT p.*, v.id as variant_id, v.product_id as variant_product_id, v.sku, v.size, v.weight, v.price, v.stock_count
      FROM (
        SELECT p.*
        FROM products p
        WHERE p.is_active = 1 ${categoryFilter}
        ORDER BY ${sortClause}
        ${limit ? 'LIMIT ? OFFSET ?' : ''}
      ) p
      LEFT JOIN variants v ON p.id = v.product_id
      ORDER BY ${sortClause}
    `;

    if (limit) {
      args.push(limit, offset);
    }

    // Fetch the raw rows
    const result = await db.execute({ sql, args });

    const productsMap = new Map();
    const variantsMap = new Map();

    result.rows.forEach(row => {
      const productId = row.id;
      if (!productsMap.has(productId)) {
        productsMap.set(productId, row);
        variantsMap.set(productId, []);
      }

      if (row.variant_id !== null && row.variant_id !== undefined || row.sku) {
        variantsMap.get(productId).push({
          id: row.variant_id || `${productId}-${row.sku}-${variantsMap.get(productId).length}`,
          sku: row.sku,
          size: row.size,
          weight: row.weight,
          price: row.price,
          stock_count: row.stock_count
        });
      }
    });

    let products = Array.from(productsMap.values()).map(row =>
      mapProduct(row, variantsMap.get(row.id))
    );

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get all products (active and inactive) for Admin
 */
const getAdminProducts = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    const search = req.query.q ? req.query.q.trim() : '';
    const limit = parseInt(req.query.limit, 10) || null;
    const offset = parseInt(req.query.offset, 10) || 0;
    const args = [];
    let filterClause = '';

    if (search) {
      filterClause = ' WHERE (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)';
      args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    let sql = `
      SELECT p.*,
        COALESCE(
          json_group_array(
            json_object(
              'id', v.id,
              'product_id', v.product_id,
              'sku', v.sku,
              'size', v.size,
              'weight', v.weight,
              'price', v.price,
              'stock_count', v.stock_count
            )
          ) FILTER (WHERE v.id IS NOT NULL),
          '[]'
        ) AS variants_json
      FROM products p
      LEFT JOIN variants v ON v.product_id = p.id
      ${filterClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    if (limit) {
      sql += ' LIMIT ? OFFSET ?';
      args.push(limit, offset);
    }

    const result = await db.execute({ sql, args });
    const products = (result.rows || []).map((row) => {
      let variants = [];
      try {
        variants = typeof row.variants_json === 'string' ? JSON.parse(row.variants_json) : (row.variants_json || []);
      } catch {
        variants = [];
      }
      return mapProduct(row, variants);
    });

    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    logger.error('Error fetching admin products:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('catalog');

    const productResult = await db.execute({
      sql: 'SELECT * FROM products WHERE id = ? AND is_active = 1',
      args: [id]
    });

    if (productResult.rows.length === 0) {
      throw generateNotFoundError('Product not found');
    }

    const variantsResult = await db.execute({
      sql: 'SELECT * FROM variants WHERE product_id = ?',
      args: [id]
    });

    const mapped = mapProduct(productResult.rows[0], variantsResult.rows);

    res.status(200).json({ success: true, data: mapped });
  } catch (error) {
    if (error.type === 'not-found') return res.status(404).json({ success: false, message: error.message });
    logger.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, description, category, image_url, is_active } = req.body;
    if (!name || !description || !category) throw generateValidationError('Name, description, and category are required');

    const db = await getDatabaseConnection('catalog');
    const productId = generateProductId();
    const isActiveInt = is_active === false ? 0 : 1;

    await db.execute({
      sql: `INSERT INTO products (id, name, description, category, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [productId, name, description, category, image_url || null, isActiveInt]
    });

    res.status(201).json({ success: true, message: 'Product created successfully', data: { id: productId, name } });
  } catch (error) {
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
    logger.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, image_url, is_active } = req.body;
    const db = await getDatabaseConnection('catalog');

    const productResult = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [id] });
    if (productResult.rows.length === 0) throw generateNotFoundError('Product not found');

    const updates = [];
    const args = [];
    if (name !== undefined) { updates.push('name = ?'); args.push(name); }
    if (description !== undefined) { updates.push('description = ?'); args.push(description); }
    if (category !== undefined) { updates.push('category = ?'); args.push(category); }
    if (image_url !== undefined) { updates.push('image_url = ?'); args.push(image_url); }
    if (is_active !== undefined) { updates.push('is_active = ?'); args.push(is_active ? 1 : 0); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) return res.status(400).json({ success: false, message: 'No fields to update' });

    args.push(id);
    await db.execute({ sql: `UPDATE products SET ${updates.join(', ')} WHERE id = ?`, args });

    res.status(200).json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    if (error.type === 'not-found') return res.status(404).json({ success: false, message: error.message });
    logger.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('catalog');

    const productResult = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [id] });
    if (productResult.rows.length === 0) throw generateNotFoundError('Product not found');

    // Hard delete or soft delete depending on what we want. The schema has ON DELETE CASCADE for variants.
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    if (error.type === 'not-found') return res.status(404).json({ success: false, message: error.message });
    logger.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createVariant = async (req, res) => {
  try {
    const { id: product_id } = req.params;
    const { sku, size, weight, price, stock_count } = req.body;
    if (!sku || price == null) throw generateValidationError('SKU and price are required');

    const db = await getDatabaseConnection('catalog');
    const variantId = 'VAR-' + Date.now();

    await db.execute({
      sql: `INSERT INTO variants (id, product_id, sku, size, weight, price, stock_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [variantId, product_id, sku, size || null, weight || null, price, stock_count || 0]
    });

    res.status(201).json({ success: true, message: 'Variant created' });
  } catch (error) {
    logger.error('Error creating variant:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, size, weight, price, stock_count } = req.body;
    const db = await getDatabaseConnection('catalog');

    const updates = [];
    const args = [];
    if (sku !== undefined) { updates.push('sku = ?'); args.push(sku); }
    if (size !== undefined) { updates.push('size = ?'); args.push(size); }
    if (weight !== undefined) { updates.push('weight = ?'); args.push(weight); }
    if (price !== undefined) { updates.push('price = ?'); args.push(price); }
    if (stock_count !== undefined) { updates.push('stock_count = ?'); args.push(Math.max(0, Number(stock_count))); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) return res.status(400).json({ success: false, message: 'No fields' });

    args.push(id);
    await db.execute({ sql: `UPDATE variants SET ${updates.join(', ')} WHERE id = ?`, args });
    if (stock_count !== undefined) {
      const variantResult = await db.execute({ sql: 'SELECT product_id FROM variants WHERE id = ?', args: [id] });
      if (variantResult.rows.length) {
        const productId = variantResult.rows[0].product_id;
        await db.execute({ sql: `UPDATE products SET is_active = CASE WHEN (SELECT COALESCE(SUM(stock_count), 0) FROM variants WHERE product_id = ?) > 0 THEN is_active ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, args: [productId, productId] });
      }
    }

    res.status(200).json({ success: true, message: 'Variant updated' });
  } catch (error) {
    logger.error('Error updating variant:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('catalog');
    await db.execute({ sql: 'DELETE FROM variants WHERE id = ?', args: [id] });
    res.status(200).json({ success: true, message: 'Variant deleted' });
  } catch (error) {
    logger.error('Error deleting variant:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getAllProducts,
  getAdminProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createVariant,
  updateVariant,
  deleteVariant
};
