const { getDatabaseConnection } = require('../../../config/turso');
const { generateNotFoundError, generateValidationError } = require('../../../utils/error-classes');
const logger = require('../../../utils/logger');
const { generateProductId, generateVariantId } = require('../../../utils/id-generator');
const { ensureCatalogCategorySchema, upsertCatalogCategory } = require('../categories/categories.schema');
const { ensureProductReviewsSchema } = require('./product-reviews.schema');
const { normalizePieceSize } = require('../variants/variants.schema');

function slugify(text) {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function canonicalCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return category === 'hilsha' ? 'hilsa' : category;
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'find', 'fresh', 'freshly', 'in', 'me', 'of', 'online',
  'order', 'product', 'products', 'search', 'the', 'to', 'with', 'buy', 'best'
]);

const FISH_KEYWORDS = [
  'aar', 'bata', 'bhetki', 'boal', 'gule', 'hilsa', 'ilish', 'kajoli', 'katla',
  'koi', 'lote', 'magur', 'pabda', 'pomfret', 'puti', 'rohu', 'rui', 'singi',
  'tangra', 'telapia', 'topse'
];

const SEARCH_SYNONYMS = {
  fish: FISH_KEYWORDS,
  seafood: [...FISH_KEYWORDS, 'fish', 'prawn', 'shrimp', 'chingri', 'crab', 'gugli'],
  hilsa: ['ilish', 'hilsha'],
  ilish: ['hilsa', 'hilsha'],
  hilsha: ['hilsa', 'ilish'],
  rohu: ['rui'],
  rui: ['rohu'],
  prawns: ['prawn', 'shrimp', 'chingri'],
  prawn: ['prawns', 'shrimp', 'chingri'],
  shrimp: ['prawn', 'prawns', 'chingri'],
  chingri: ['prawn', 'prawns', 'shrimp'],
  crab: ['kankra'],
  kankra: ['crab'],
  mutton: ['goat', 'lamb'],
  goat: ['mutton', 'lamb'],
  lamb: ['mutton', 'goat'],
  meat: ['mutton', 'chicken', 'duck'],
  chicken: ['poultry'],
  poultry: ['chicken'],
  keema: ['mince', 'minced', 'ground'],
  mince: ['keema', 'minced', 'ground'],
  minced: ['keema', 'mince', 'ground'],
  drumstick: ['drumsticks', 'leg', 'legs'],
  leg: ['legs', 'drumstick', 'drumsticks'],
  desi: ['deshi'],
  deshi: ['desi'],
  maach: ['fish', ...FISH_KEYWORDS],
  mach: ['fish', ...FISH_KEYWORDS],
  offal: ['liver'],
  liver: ['offal']
};

const SEARCH_VOCABULARY = [...new Set([
  ...Object.keys(SEARCH_SYNONYMS),
  ...Object.values(SEARCH_SYNONYMS).flat(),
  'boneless', 'curry', 'cut', 'deshi', 'fillet', 'whole', 'kata', 'peti',
  'gota', 'keema', 'roe', 'small', 'large', 'fresh', 'frozen'
])];

function validateCatalogVariants(variants) {
  if (!Array.isArray(variants)) throw generateValidationError('Variants must be a list');
  const seenSkus = new Set();
  return variants.map((variant) => {
    const name = String(variant?.variant_name ?? variant?.size ?? '').trim();
    const sku = String(variant?.sku ?? '').trim();
    const rawPrice = variant?.price;
    const rawStock = variant?.stock_count ?? variant?.stock;
    const price = Number(rawPrice);
    const stock = Number(rawStock);
    if (!name || /^new\s+(size|variant)$/i.test(name) || /^standard(?:\s.*)?$/i.test(name)) throw generateValidationError('Enter a real name for every variant');
    if (!sku) throw generateValidationError('SKU is required for every variant');
    if (seenSkus.has(sku.toLowerCase())) throw generateValidationError(`Duplicate SKU in this product: ${sku}`);
    seenSkus.add(sku.toLowerCase());
    if (rawPrice == null || String(rawPrice).trim() === '' || !Number.isFinite(price) || price < 0) throw generateValidationError(`Enter a valid price for ${name}`);
    if (rawStock == null || String(rawStock).trim() === '' || !Number.isInteger(stock) || stock < 0) throw generateValidationError(`Enter a whole-number stock count for ${name}`);
    const availability = variant?.is_available ?? variant?.isAvailable ?? true;
    if (![true, false, 0, 1].includes(availability)) throw generateValidationError(`Availability is invalid for ${name}`);
    const rawPieceSize = variant?.piece_size ?? variant?.pieceSize;
    const pieceSize = normalizePieceSize(rawPieceSize);
    if (rawPieceSize != null && String(rawPieceSize).trim() !== '' && !pieceSize) {
      throw generateValidationError(`Piece size must be Small, Medium, or Large for ${name}`);
    }
    return {
      id: variant?.id && !String(variant.id).startsWith('temp-') ? String(variant.id) : generateVariantId(),
      sku,
      name,
      weight: variant?.weight == null || variant.weight === '' ? null : String(variant.weight),
      pieceSize,
      price,
      stock,
      available: availability === true || availability === 1 ? 1 : 0
    };
  });
}

async function writeCatalogVariants(transaction, productId, variants, { replace = false } = {}) {
  const savedIds = [];
  for (const variant of variants) {
    const existing = await transaction.execute({
      sql: 'SELECT id, product_id, sku FROM variants WHERE id = ? OR LOWER(sku) = LOWER(?)',
      args: [variant.id, variant.sku]
    });
    const idMatch = existing.rows.find((row) => row.id === variant.id);
    if (idMatch && idMatch.product_id !== productId) throw generateValidationError('Variant does not belong to this product');
    const skuMatch = existing.rows.find((row) => String(row.sku || '').toLowerCase() === variant.sku.toLowerCase() && row.id !== variant.id);
    if (skuMatch) throw generateValidationError(`SKU already exists: ${variant.sku}`);

    if (idMatch) {
      await transaction.execute({
        sql: `UPDATE variants SET sku = ?, size = ?, weight = ?, piece_size = ?, price = ?, stock_count = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND product_id = ?`,
        args: [variant.sku, variant.name, variant.weight, variant.pieceSize, variant.price, variant.stock, variant.available, variant.id, productId]
      });
    } else {
      await transaction.execute({
        sql: `INSERT INTO variants (id, product_id, sku, size, weight, piece_size, price, stock_count, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [variant.id, productId, variant.sku, variant.name, variant.weight, variant.pieceSize, variant.price, variant.stock, variant.available]
      });
    }
    savedIds.push(variant.id);
  }

  if (replace) {
    if (savedIds.length) {
      const placeholders = savedIds.map(() => '?').join(', ');
      await transaction.execute({ sql: `DELETE FROM variants WHERE product_id = ? AND id NOT IN (${placeholders})`, args: [productId, ...savedIds] });
    } else {
      await transaction.execute({ sql: 'DELETE FROM variants WHERE product_id = ?', args: [productId] });
    }
  }
}

function searchEditDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function getNearbySearchTerms(word) {
  if (word.length < 4) return [];
  const maxDistance = word.length >= 5 ? 2 : 1;
  return SEARCH_VOCABULARY
    .map(candidate => ({ candidate, distance: searchEditDistance(word, candidate) }))
    .filter(match => match.distance > 0 && match.distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance || Math.abs(left.candidate.length - word.length) - Math.abs(right.candidate.length - word.length))
    .slice(0, 3)
    .map(match => match.candidate);
}

function singularizeSearchWord(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function getSearchWordGroups(query) {
  const normalized = String(query || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const words = [...new Set(normalized.split(/\s+/).filter(Boolean))]
    .map(singularizeSearchWord)
    .filter(word => !SEARCH_STOP_WORDS.has(word))
    .slice(0, 8);

  return words.map(word => {
    const synonyms = Object.prototype.hasOwnProperty.call(SEARCH_SYNONYMS, word)
      ? SEARCH_SYNONYMS[word]
      : [];
    const nearbyTerms = getNearbySearchTerms(word);
    const nearbySynonyms = nearbyTerms.flatMap(term => SEARCH_SYNONYMS[term] || []);
    return [...new Set([word, ...synonyms, ...nearbyTerms, ...nearbySynonyms])];
  });
}

function buildProductKeywordFilter(query) {
  const groups = getSearchWordGroups(query);
  const args = [];
  const clauses = groups.map(group => {
    const alternatives = group.map(keyword => {
      const pattern = `%${keyword}%`;
      args.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
      return `(
        LOWER(COALESCE(p.name, '')) LIKE ?
        OR LOWER(COALESCE(p.category, '')) LIKE ?
        OR LOWER(COALESCE(p.description, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM variants search_variant
          WHERE search_variant.product_id = p.id
            AND (
              LOWER(COALESCE(search_variant.sku, '')) LIKE ?
              OR LOWER(COALESCE(search_variant.size, '')) LIKE ?
              OR LOWER(COALESCE(search_variant.weight, '')) LIKE ?
              OR LOWER(COALESCE(search_variant.piece_size, '')) LIKE ?
            )
        )
      )`;
    });
    return `(${alternatives.join(' OR ')})`;
  });

  return {
    clause: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    args
  };
}

function cleanImageUrl(value) {
  const image = String(value || '').trim();
  return !image || /^https?:\/\/example\.com(?:\/|$)/i.test(image) ? null : image;
}

function mapProduct(row, variants = []) {
  const mappedVariants = variants.map((variant) => {
    const isAvailable = Number(variant.is_available ?? variant.isAvailable ?? 1) === 1;
    const stock = Number(variant.stock_count || 0);
    const sizeName = String(variant.size || '').trim();
    const isGenericSize = !sizeName || /^standard(?:\s|$)/i.test(sizeName);
    const packLabel = (isGenericSize ? (variant.weight || sizeName.replace(/^standard\s*/i, '')) : sizeName) || variant.sku;
    const pieceSize = normalizePieceSize(variant.piece_size ?? variant.pieceSize);
    return {
      id: variant.id,
      sku: variant.sku,
      // `size` stores the admin's customer-facing variant name. `weight` is
      // separate metadata. Only use it as the label for legacy generic sizes.
      label: [packLabel, pieceSize].filter(Boolean).join(' · '),
      size: variant.size || null,
      weight: variant.weight || null,
      pieceSize,
      price: Number(variant.price),
      stock,
      stockCount: stock,
      isAvailable,
      available: isAvailable && stock > 0
    };
  });
  const totalStock = mappedVariants.reduce((sum, variant) => sum + variant.stock, 0);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || slugify(row.name),
    description: row.description || '',
    shortDescription: row.short_description || row.description || '',
    category: canonicalCategory(row.category),
    image: cleanImageUrl(row.image_url),
    imageUrl: cleanImageUrl(row.image_url),
    isActive: Boolean(row.is_active) && totalStock > 0,
    rating: Number(row.review_count || 0) > 0
      ? Number(Number(row.review_rating).toFixed(2))
      : (row.rating == null ? null : Number(row.rating)),
    reviewCount: Number(row.review_count || 0),
    variants: mappedVariants
  };
}

/**
 * Get all active products for Storefront
 */
const getAllProducts = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    await ensureProductReviewsSchema(db);
    const category = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const search = req.query.q ? req.query.q.trim() : '';
    const sort = req.query.sort || 'popular';
    const limit = parseInt(req.query.limit, 10) || null;
    const offset = parseInt(req.query.offset, 10) || 0;

    let categoryFilter = '';
    const args = [];
    if (category && category !== 'all') {
      // The storefront routes with normalized slugs, while catalog rows keep
      // their display names (for example, crabs-seafood vs Crabs & Seafood).
      const categoryAliases = {
        fish: 'fish',
        chicken: 'chicken',
        mutton: 'mutton',
        prawns: 'prawns',
        'crabs-seafood': 'crabs & seafood',
        hilsa: 'hilsa',
        hilsha: 'hilsa',
        combos: 'combos',
        offers: 'offers'
      };
      const categoryValue = categoryAliases[category] || category;
      if (category === 'hilsa' || category === 'hilsha') {
        categoryFilter += " AND LOWER(TRIM(p.category)) IN ('hilsa', 'hilsha')";
      } else {
        categoryFilter += ` AND (
          LOWER(TRIM(p.category)) = LOWER(TRIM(?))
          OR LOWER(REPLACE(TRIM(p.category), ' ', '-')) = LOWER(TRIM(?))
          OR LOWER(REPLACE(REPLACE(TRIM(p.category), ' & ', '-'), ' ', '-')) = LOWER(TRIM(?))
        )`;
        args.push(categoryValue, category, category);
      }
    }

    const keywordFilter = buildProductKeywordFilter(search);
    categoryFilter += keywordFilter.clause;
    args.push(...keywordFilter.args);

    let sortClause = 'p.created_at DESC';
    if (sort === 'price-low') {
      sortClause = '(SELECT MIN(price) FROM variants WHERE product_id = p.id) ASC';
    } else if (sort === 'price-high') {
      sortClause = '(SELECT MAX(price) FROM variants WHERE product_id = p.id) DESC';
    } else if (sort === 'rating') {
      sortClause = 'p.rating DESC, p.created_at DESC';
    }

    let sql = `
      SELECT p.*, v.id as variant_id, v.product_id as variant_product_id, v.sku, v.size, v.weight, v.piece_size, v.price, v.stock_count, v.is_available
      FROM (
        SELECT p.*,
          (SELECT COUNT(*) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.is_visible = 1) AS review_count,
          (SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.is_visible = 1) AS review_rating
        FROM products p
        WHERE p.is_active = 1
          AND LOWER(TRIM(COALESCE(p.category, ''))) NOT IN ('', 'undefined', 'null', 'n/a', 'na')
          AND LOWER(TRIM(COALESCE(p.name, ''))) NOT IN ('', 'undefined', 'null')
          AND NOT EXISTS (
            SELECT 1 FROM catalog_categories disabled_category
            WHERE disabled_category.is_active = 0
              AND (
                LOWER(TRIM(disabled_category.category_name)) = LOWER(TRIM(p.category))
                OR (disabled_category.category_slug = 'hilsa' AND LOWER(TRIM(p.category)) = 'hilsha')
              )
          )
          ${categoryFilter}
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
          piece_size: row.piece_size,
          price: row.price,
          stock_count: row.stock_count,
          is_available: row.is_available
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
              'piece_size', v.piece_size,
              'price', v.price,
              'stock_count', v.stock_count,
              'is_available', v.is_available
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
    await ensureCatalogCategorySchema(db);
    await ensureProductReviewsSchema(db);

    const productResult = await db.execute({
      sql: `SELECT p.*,
          (SELECT COUNT(*) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.is_visible = 1) AS review_count,
          (SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.is_visible = 1) AS review_rating
        FROM products p WHERE p.id = ? AND p.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM catalog_categories disabled_category
          WHERE disabled_category.is_active = 0
            AND (LOWER(TRIM(disabled_category.category_name)) = LOWER(TRIM(p.category))
              OR (disabled_category.category_slug = 'hilsa' AND LOWER(TRIM(p.category)) = 'hilsha'))
        )`,
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
    const { name, description = '', category, image_url, is_active } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim()) throw generateValidationError('Name and category are required');
    if (description != null && typeof description !== 'string') throw generateValidationError('Product details must be text');
    if (image_url != null && typeof image_url !== 'string') throw generateValidationError('Product image URL must be text');
    if (is_active !== undefined && ![true, false, 0, 1].includes(is_active)) throw generateValidationError('Product visibility must be true or false');

    const db = await getDatabaseConnection('catalog');
    await ensureCatalogCategorySchema(db);
    const productId = generateProductId();
    const isActiveInt = is_active === false ? 0 : 1;
    const hasVariants = req.body.variants !== undefined;
    const variants = hasVariants ? validateCatalogVariants(req.body.variants) : [];
    const transaction = await db.transaction('write');
    try {
      await transaction.execute({
        sql: `INSERT INTO products (id, name, description, category, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [productId, name.trim(), String(description || ''), category.trim(), image_url?.trim() || null, isActiveInt]
      });
      await upsertCatalogCategory(transaction, category.trim());
      if (hasVariants) await writeCatalogVariants(transaction, productId, variants);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await transaction.close();
    }

    res.status(201).json({ success: true, message: 'Product created successfully', data: { id: productId, name: name.trim() } });
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
    if (category !== undefined) await ensureCatalogCategorySchema(db);

    const productResult = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [id] });
    if (productResult.rows.length === 0) throw generateNotFoundError('Product not found');

    const hasVariants = req.body.variants !== undefined;
    const variants = hasVariants ? validateCatalogVariants(req.body.variants) : [];

    const updates = [];
    const args = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) throw generateValidationError('Product name cannot be blank');
      updates.push('name = ?'); args.push(name.trim());
    }
    if (description !== undefined) {
      if (typeof description !== 'string') throw generateValidationError('Product details must be text');
      updates.push('description = ?'); args.push(description);
    }
    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) throw generateValidationError('Product category cannot be blank');
      updates.push('category = ?'); args.push(category.trim());
    }
    if (image_url !== undefined) {
      if (image_url != null && typeof image_url !== 'string') throw generateValidationError('Product image URL must be text');
      updates.push('image_url = ?'); args.push(image_url?.trim() || null);
    }
    if (is_active !== undefined) {
      if (![true, false, 0, 1].includes(is_active)) throw generateValidationError('Product visibility must be true or false');
      updates.push('is_active = ?'); args.push(is_active === true || is_active === 1 ? 1 : 0);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1 && !hasVariants) return res.status(400).json({ success: false, message: 'No fields to update' });

    const transaction = await db.transaction('write');
    try {
      if (updates.length > 1) {
        args.push(id);
        await transaction.execute({ sql: `UPDATE products SET ${updates.join(', ')} WHERE id = ?`, args });
      }
      if (category !== undefined) await upsertCatalogCategory(transaction, category.trim());
      if (hasVariants) await writeCatalogVariants(transaction, id, variants, { replace: true });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      await transaction.close();
    }

    res.status(200).json({ success: true, message: 'Product updated successfully', data: { id } });
  } catch (error) {
    if (error.type === 'not-found') return res.status(404).json({ success: false, message: error.message });
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
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
    const { sku, weight, price, stock_count, is_available } = req.body;
    const size = req.body?.variant_name ?? req.body?.size;
    const rawPieceSize = req.body?.piece_size ?? req.body?.pieceSize;
    const pieceSize = normalizePieceSize(rawPieceSize);
    const variantName = typeof size === 'string' ? size.trim() : '';
    if (!sku || !variantName || price == null) throw generateValidationError('SKU, variant name, and price are required');
    if (/^new\s+(size|variant)$/i.test(variantName) || /^standard(?:\s.*)?$/i.test(variantName)) throw generateValidationError('Enter a real variant name');
    if (rawPieceSize != null && String(rawPieceSize).trim() !== '' && !pieceSize) throw generateValidationError('Piece size must be Small, Medium, or Large');
    if (!Number.isFinite(Number(price)) || Number(price) < 0) throw generateValidationError('Price must be a non-negative number');
    if (stock_count !== undefined && (!Number.isFinite(Number(stock_count)) || Number(stock_count) < 0)) throw generateValidationError('Stock must be a non-negative number');

    const db = await getDatabaseConnection('catalog');
    const variantId = 'VAR-' + Date.now();

    await db.execute({
      sql: `INSERT INTO variants (id, product_id, sku, size, weight, piece_size, price, stock_count, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [variantId, product_id, sku, variantName, weight || null, pieceSize, Number(price), Math.floor(Number(stock_count) || 0), is_available === false || is_available === 0 ? 0 : 1]
    });

    res.status(201).json({ success: true, message: 'Variant created' });
  } catch (error) {
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
    logger.error('Error creating variant:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, weight, price, stock_count } = req.body;
    const size = req.body?.variant_name ?? req.body?.size;
    const rawPieceSize = req.body?.piece_size ?? req.body?.pieceSize;
    const db = await getDatabaseConnection('catalog');

    const updates = [];
    const args = [];
    if (rawPieceSize !== undefined) {
      const pieceSize = normalizePieceSize(rawPieceSize);
      if (rawPieceSize != null && String(rawPieceSize).trim() !== '' && !pieceSize) throw generateValidationError('Piece size must be Small, Medium, or Large');
      updates.push('piece_size = ?'); args.push(pieceSize);
    }
    if (sku !== undefined) { updates.push('sku = ?'); args.push(sku); }
    if (size !== undefined) {
      if (typeof size !== 'string' || !size.trim() || /^new\s+(size|variant)$/i.test(size.trim()) || /^standard(?:\s.*)?$/i.test(size.trim())) {
        throw generateValidationError('Enter a real variant name');
      }
      updates.push('size = ?');
      args.push(size.trim());
    }
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
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
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

