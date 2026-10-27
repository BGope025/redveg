const { getDatabaseConnection } = require('../../../config/turso');
const logger = require('../../../utils/logger');
const { ensureCategoryImageSchema, ensureCatalogCategorySchema, normalizeCategorySlug: categorySlug } = require('./categories.schema');

function normalizeCategorySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-and-/g, '-');
}

async function readCategoryRows(db) {
  const [productsResult, settingsResult, registeredResult] = await Promise.all([
    db.execute({
      sql: `SELECT TRIM(category) AS category,
        MAX(CASE WHEN is_active = 1 AND image_url IS NOT NULL AND image_url != ''
          AND LOWER(TRIM(image_url)) NOT LIKE 'https://example.com/%' THEN image_url END) AS product_image,
        COUNT(*) AS product_count
        FROM products
        WHERE category IS NOT NULL AND LOWER(TRIM(category)) NOT IN ('', 'undefined', 'null', 'n/a', 'na')
        GROUP BY TRIM(category) ORDER BY category`,
      args: [],
    }),
    db.execute('SELECT category_slug, category_name, image_url, updated_at FROM category_image_settings'),
    db.execute('SELECT category_slug, category_name, is_active, created_at, updated_at FROM catalog_categories'),
  ]);
  const settings = new Map(settingsResult.rows.map((row) => [String(row.category_slug), row]));
  const grouped = new Map();
  for (const row of registeredResult.rows || []) {
    const slug = String(row.category_slug);
    grouped.set(slug, { id: slug, name: String(row.category_name), isActive: Number(row.is_active ?? 1) === 1, productImage: null, productCount: 0, createdAt: row.created_at || null });
  }
  for (const row of productsResult.rows) {
    let slug = normalizeCategorySlug(row.category);
    if (slug === 'hilsha') slug = 'hilsa';
    const name = slug === 'hilsa' ? 'Hilsa' : String(row.category).trim().toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    const current = grouped.get(slug) || { id: slug, name, productImage: null, productCount: 0 };
    if (!current.productCount && !current.productImage && !current.createdAt) current.name = name;
    current.productImage = current.productImage || row.product_image || null;
    current.productCount += Number(row.product_count || 0);
    grouped.set(slug, current);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name)).map((category) => {
    const setting = settings.get(category.id);
    return {
      ...category,
      imageUrl: setting?.image_url || null,
      image: setting?.image_url || category.productImage || `/placeholder-${category.id}.jpg`,
      updatedAt: setting?.updated_at || null,
    };
  });
}

const createCategory = async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 60) {
    return res.status(400).json({ success: false, message: 'Enter a category name of 1 to 60 characters.' });
  }
  const slug = categorySlug(name);
  if (!slug) return res.status(400).json({ success: false, message: 'Enter a category name with letters or numbers.' });
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureCategoryImageSchema(db);
    const existing = await db.execute({
      sql: 'SELECT category_slug, category_name FROM catalog_categories WHERE category_slug = ? OR LOWER(category_name) = LOWER(?) LIMIT 1',
      args: [slug, name],
    });
    if (existing.rows.length) return res.status(409).json({ success: false, message: `The category “${existing.rows[0].category_name}” already exists.` });
    const normalizedName = name.toLowerCase() === 'hilsha'
      ? 'Hilsa'
      : name.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
    await db.execute({
      sql: 'INSERT INTO catalog_categories (category_slug, category_name) VALUES (?, ?)',
      args: [slug, normalizedName],
    });
    return res.status(201).json({
      success: true,
      message: 'Category created.',
      data: { id: slug, name: normalizedName, isActive: true, productCount: 0, productImage: null, imageUrl: null, image: `/placeholder-${slug}.jpg` },
    });
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error.message))) return res.status(409).json({ success: false, message: 'A category with this name or URL key already exists.' });
    logger.error('Error creating category:', error);
    return res.status(500).json({ success: false, message: 'Category could not be created.' });
  }
};

/**
 * Get all unique categories
 * @route GET /api/v1/categories
 */
const getAllCategories = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureCategoryImageSchema(db);
    // Keep the storefront in sync with the admin registry, including newly
    // created categories that do not have products assigned yet.
    const rows = await readCategoryRows(db);
    const categories = rows.filter((row) => row.isActive).map((row, index) => ({
      id: row.id,
      name: row.name,
      description: `${row.name} products`,
      image: row.image,
      accent: getRandomAccentColor(index),
      productCount: row.productCount,
    }));
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(categories);
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAdminCategories = async (_req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureCategoryImageSchema(db);
    const categories = await readCategoryRows(db);
    return res.status(200).json({ success: true, data: categories });
  } catch (error) {
    logger.error('Error fetching admin category images:', error);
    return res.status(500).json({ success: false, message: 'Category images could not be loaded.' });
  }
};

const updateCategoryImage = async (req, res) => {
  const slug = normalizeCategorySlug(req.params.slug);
  const imageUrl = String(req.body?.imageUrl ?? '').trim();
  if (!slug) return res.status(400).json({ success: false, message: 'A valid category is required.' });
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw new Error('invalid host');
    } catch {
      return res.status(400).json({ success: false, message: 'Use a secure Cloudinary image URL.' });
    }
  }
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureCategoryImageSchema(db);
    const categories = await readCategoryRows(db);
    const category = categories.find((row) => row.id === slug);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found in the catalog.' });
    if (imageUrl) {
      await db.execute({
        sql: `INSERT INTO category_image_settings (category_slug, category_name, image_url, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(category_slug) DO UPDATE SET category_name = excluded.category_name,
            image_url = excluded.image_url, updated_at = CURRENT_TIMESTAMP`,
        args: [slug, category.name, imageUrl],
      });
    } else {
      await db.execute({ sql: 'DELETE FROM category_image_settings WHERE category_slug = ?', args: [slug] });
    }
    const updated = { ...category, imageUrl: imageUrl || null, image: imageUrl || category.productImage || `/placeholder-${slug}.jpg` };
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error('Error saving category image:', error);
    return res.status(500).json({ success: false, message: 'Category image could not be saved.' });
  }
};

const setCategoryStatus = async (req, res) => {
  const slug = normalizeCategorySlug(req.params.slug);
  const isActive = req.body?.isActive;
  if (!slug || typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Choose whether the category should be active.' });
  }
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    const result = await db.execute({
      sql: 'UPDATE catalog_categories SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE category_slug = ?',
      args: [isActive ? 1 : 0, slug],
    });
    if (!result.rowsAffected) return res.status(404).json({ success: false, message: 'Category not found.' });
    return res.status(200).json({ success: true, data: { id: slug, isActive } });
  } catch (error) {
    logger.error('Error updating category status:', error);
    return res.status(500).json({ success: false, message: 'Category status could not be updated.' });
  }
};

const deleteCategory = async (req, res) => {
  const slug = normalizeCategorySlug(req.params.slug);
  if (!slug) return res.status(400).json({ success: false, message: 'A valid category is required.' });
  let transaction;
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureCategoryImageSchema(db);
    transaction = await db.transaction('write');
    const categoryResult = await transaction.execute({
      sql: 'SELECT category_name FROM catalog_categories WHERE category_slug = ?', args: [slug],
    });
    if (!categoryResult.rows.length) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    const categoryName = String(categoryResult.rows[0].category_name);
    const productResult = await transaction.execute({
      sql: `SELECT COUNT(*) AS product_count FROM products
        WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))
          OR (? = 'hilsa' AND LOWER(TRIM(category)) = 'hilsha')`, args: [categoryName, slug],
    });
    const productCount = Number(productResult.rows?.[0]?.product_count || 0);
    if (productCount > 0) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: `Reassign or remove the ${productCount} product${productCount === 1 ? '' : 's'} in this category before deleting it.` });
    }
    await transaction.execute({ sql: 'DELETE FROM category_image_settings WHERE category_slug = ?', args: [slug] });
    await transaction.execute({ sql: 'DELETE FROM catalog_categories WHERE category_slug = ?', args: [slug] });
    await transaction.commit();
    return res.status(200).json({ success: true, data: { id: slug } });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    logger.error('Error deleting category:', error);
    return res.status(500).json({ success: false, message: 'Category could not be deleted.' });
  }
};

// Helper function to generate varied accent colors for categories
function getRandomAccentColor(index) {
  const colors = [
    '#DCEED8', // Fish - greenish
    '#FBE0D6', // Chicken - peach
    '#F3D8D5', // Mutton - light red
    '#F8E7C9', // Prawns - beige
    '#D8E8EA', // Seafood - light blue
    '#E5E0D7'  // Combos - neutral
  ];
  return colors[index % colors.length] || '#DCEED8';
}

module.exports = {
  getAllCategories,
  getAdminCategories,
  createCategory,
  updateCategoryImage,
  setCategoryStatus,
  deleteCategory,
};


