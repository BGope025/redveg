const { randomUUID } = require('crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { ensureCouponSchema } = require('./coupons.schema');
const { generateCartSnapshot } = require('../../../utils/id-generator');
const { CouponValidationError, roundMoney, calculateDeliveryFee, findApplicableCoupon } = require('../../../services/coupon.service');
const logger = require('../../../utils/logger');

class CouponInputError extends Error {}

async function getCouponDatabase() {
  const db = await getDatabaseConnection('catalog');
  await ensureCouponSchema(db);
  return db;
}

function toCoupon(row) {
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? '',
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxDiscountAmount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
    minOrderAmount: Number(row.min_order_amount ?? 0),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    usageLimit: row.usage_limit == null ? null : Number(row.usage_limit),
    usageCount: Number(row.usage_count ?? 0),
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMoney(value, field, { allowZero = false, optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new CouponInputError(`${field} must be a valid ${allowZero ? 'non-negative' : 'positive'} amount`);
  }
  return Math.round(amount * 100) / 100;
}

function parseUsageLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new CouponInputError('Usage limit must be a positive whole number or null');
  return limit;
}

function parseDate(value, field) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new CouponInputError(`${field} must be a valid date`);
  return new Date(time).toISOString();
}

function parseBoolean(value, field) {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  throw new CouponInputError(`${field} must be true or false`);
}

function normalizeCouponInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CouponInputError('A coupon object is required');

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    throw new CouponInputError('Coupon code must be 3–32 characters using letters, numbers, hyphens or underscores');
  }

  const discountType = String(body.discountType ?? '').trim().toLowerCase();
  if (!['percentage', 'fixed'].includes(discountType)) throw new CouponInputError('Discount type must be percentage or fixed');

  const discountValue = parseMoney(body.discountValue, 'Discount value');
  if (discountType === 'percentage' && discountValue > 100) throw new CouponInputError('Percentage discount cannot exceed 100');
  const startsAt = parseDate(body.startsAt, 'Start date');
  const endsAt = parseDate(body.endsAt, 'End date');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new CouponInputError('End date must be after start date');

  const description = body.description == null ? '' : String(body.description).trim();
  if (description.length > 300) throw new CouponInputError('Description must be 300 characters or fewer');

  return {
    code,
    description: description || null,
    discountType,
    discountValue,
    maxDiscountAmount: parseMoney(body.maxDiscountAmount, 'Maximum discount', { optional: true }),
    minOrderAmount: parseMoney(body.minOrderAmount ?? 0, 'Minimum order amount', { allowZero: true }),
    startsAt,
    endsAt,
    usageLimit: parseUsageLimit(body.usageLimit),
    isActive: body.isActive === undefined ? 1 : parseBoolean(body.isActive, 'Active status'),
  };
}

function sendError(res, error, operation) {
  if (error instanceof CouponInputError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (/UNIQUE constraint failed: coupons\.code/i.test(String(error.message))) {
    return res.status(409).json({ success: false, message: 'A coupon with this code already exists' });
  }
  logger.error(`Error ${operation} coupons:`, error);
  return res.status(500).json({ success: false, message: 'Internal server error' });
}

async function getCoupons(req, res) {
  try {
    const db = await getCouponDatabase();
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filters = [];
    const args = [];

    if (req.query.status === 'active') filters.push('is_active = 1');
    if (req.query.status === 'inactive') filters.push('is_active = 0');
    if (search) {
      filters.push('(code LIKE ? COLLATE NOCASE OR description LIKE ? COLLATE NOCASE)');
      args.push(`%${search}%`, `%${search}%`);
    }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    const countResult = await db.execute({ sql: `SELECT COUNT(*) AS total FROM coupons${where}`, args });
    const result = await db.execute({
      sql: `SELECT * FROM coupons${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    return res.status(200).json({
      success: true,
      count: Number(countResult.rows[0]?.total) || 0,
      data: result.rows.map(toCoupon),
    });
  } catch (error) {
    return sendError(res, error, 'fetching');
  }
}

async function getActiveCoupons(req, res) {
  try {
    const db = await getCouponDatabase();
    const result = await db.execute({
      sql: `SELECT id, code, description, discount_type, discount_value,
                   max_discount_amount, min_order_amount, starts_at, ends_at,
                   usage_limit, usage_count, is_active, created_at, updated_at
            FROM coupons
            WHERE is_active = 1
              AND datetime(starts_at) <= datetime('now')
              AND datetime(ends_at) > datetime('now')
              AND (usage_limit IS NULL OR usage_count < usage_limit)
            ORDER BY code COLLATE NOCASE`,
    });
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows.map(toCoupon) });
  } catch (error) {
    return sendError(res, error, 'fetching active');
  }
}

async function validateCoupon(req, res) {
  try {
    const { code, cartItems } = req.body || {};
    if (!Array.isArray(cartItems) || !cartItems.length || cartItems.some((item) =>
      !item || typeof item.productId !== 'string' || !item.productId ||
      typeof item.variantId !== 'string' || !item.variantId ||
      !Number.isInteger(item.quantity) || item.quantity < 1
    )) {
      return res.status(400).json({ success: false, message: 'A valid non-empty cart is required to check this coupon.' });
    }

    const db = await getDatabaseConnection('catalog');
    const cartSnapshot = await generateCartSnapshot(cartItems, db).catch(() => {
      throw new CouponValidationError('One or more basket items are no longer available. Refresh your basket and try again.');
    });
    const subtotalAmount = roundMoney(cartSnapshot.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const coupon = await findApplicableCoupon(db, code, subtotalAmount);
    const deliveryFee = calculateDeliveryFee(subtotalAmount);
    const totalAmount = roundMoney(subtotalAmount - coupon.discountAmount + deliveryFee);

    return res.status(200).json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscountAmount: coupon.maxDiscountAmount,
          minOrderAmount: coupon.minOrderAmount,
        },
        subtotalAmount,
        discountAmount: coupon.discountAmount,
        deliveryFee,
        totalAmount,
      },
    });
  } catch (error) {
    if (error instanceof CouponValidationError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error('Error validating coupon:', error);
    return res.status(500).json({ success: false, message: 'Unable to check this coupon right now.' });
  }
}

async function createCoupon(req, res) {
  try {
    const coupon = normalizeCouponInput(req.body);
    const id = randomUUID();
    const db = await getCouponDatabase();
    await db.execute({
      sql: `INSERT INTO coupons (
              id, code, description, discount_type, discount_value,
              max_discount_amount, min_order_amount, starts_at, ends_at,
              usage_limit, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, coupon.code, coupon.description, coupon.discountType, coupon.discountValue,
        coupon.maxDiscountAmount, coupon.minOrderAmount, coupon.startsAt, coupon.endsAt,
        coupon.usageLimit, coupon.isActive],
    });
    const result = await db.execute({ sql: 'SELECT * FROM coupons WHERE id = ?', args: [id] });
    return res.status(201).json({ success: true, message: 'Coupon created', data: toCoupon(result.rows[0]) });
  } catch (error) {
    return sendError(res, error, 'creating');
  }
}

async function updateCoupon(req, res) {
  try {
    const db = await getCouponDatabase();
    const currentResult = await db.execute({ sql: 'SELECT * FROM coupons WHERE id = ?', args: [req.params.id] });
    if (!currentResult.rows.length) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const current = toCoupon(currentResult.rows[0]);
    const updated = normalizeCouponInput({ ...current, ...(req.body || {}) });
    await db.execute({
      sql: `UPDATE coupons SET
              code = ?, description = ?, discount_type = ?, discount_value = ?,
              max_discount_amount = ?, min_order_amount = ?, starts_at = ?, ends_at = ?,
              usage_limit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [updated.code, updated.description, updated.discountType, updated.discountValue,
        updated.maxDiscountAmount, updated.minOrderAmount, updated.startsAt, updated.endsAt,
        updated.usageLimit, updated.isActive, req.params.id],
    });
    const result = await db.execute({ sql: 'SELECT * FROM coupons WHERE id = ?', args: [req.params.id] });
    return res.status(200).json({ success: true, message: 'Coupon updated', data: toCoupon(result.rows[0]) });
  } catch (error) {
    return sendError(res, error, 'updating');
  }
}

async function deactivateCoupon(req, res) {
  try {
    const db = await getCouponDatabase();
    const result = await db.execute({
      sql: 'UPDATE coupons SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [req.params.id],
    });
    if (!result.rowsAffected) return res.status(404).json({ success: false, message: 'Coupon not found' });
    return res.status(200).json({ success: true, message: 'Coupon deactivated' });
  } catch (error) {
    return sendError(res, error, 'deactivating');
  }
}

module.exports = { getCoupons, getActiveCoupons, validateCoupon, createCoupon, updateCoupon, deactivateCoupon };
