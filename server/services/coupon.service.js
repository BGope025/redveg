const { ensureCouponSchema } = require('../api/v1/coupons/coupons.schema');

class CouponValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CouponValidationError';
    this.statusCode = statusCode;
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateDeliveryFee(subtotal) {
  return subtotal > 0 && subtotal < 799 ? 49 : 0;
}

async function findApplicableCoupon(db, code, subtotal) {
  await ensureCouponSchema(db);
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizedCode)) {
    throw new CouponValidationError('Enter a valid coupon code.');
  }
  const normalizedSubtotal = roundMoney(subtotal);
  if (!Number.isFinite(normalizedSubtotal) || normalizedSubtotal <= 0) {
    throw new CouponValidationError('Add an item to your basket before applying a coupon.');
  }

  const result = await db.execute({
    sql: 'SELECT * FROM coupons WHERE code = ? COLLATE NOCASE',
    args: [normalizedCode],
  });
  const coupon = result.rows[0];
  if (!coupon) throw new CouponValidationError('This coupon code was not found.');
  if (Number(coupon.is_active) !== 1) throw new CouponValidationError('This coupon is paused.');

  const now = Date.now();
  const startsAt = Date.parse(coupon.starts_at);
  const endsAt = Date.parse(coupon.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now < startsAt) {
    throw new CouponValidationError('This coupon is not active yet.');
  }
  if (now >= endsAt) throw new CouponValidationError('This coupon has expired.');
  if (coupon.usage_limit != null && Number(coupon.usage_count) >= Number(coupon.usage_limit)) {
    throw new CouponValidationError('This coupon has reached its usage limit.');
  }
  const minimum = Number(coupon.min_order_amount) || 0;
  if (normalizedSubtotal < minimum) {
    throw new CouponValidationError(`Add ₹${roundMoney(minimum - normalizedSubtotal).toLocaleString('en-IN')} more to use this coupon.`);
  }

  const discountType = String(coupon.discount_type);
  const discountValue = Number(coupon.discount_value);
  let discountAmount = discountType === 'percentage'
    ? normalizedSubtotal * discountValue / 100
    : discountValue;
  if (coupon.max_discount_amount != null) {
    discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
  }
  discountAmount = roundMoney(Math.min(normalizedSubtotal, discountAmount));

  return {
    couponId: String(coupon.id),
    code: String(coupon.code),
    discountType,
    discountValue,
    maxDiscountAmount: coupon.max_discount_amount == null ? null : Number(coupon.max_discount_amount),
    minOrderAmount: minimum,
    discountAmount,
  };
}

async function reserveCouponUsage(db, couponId) {
  const result = await db.execute({
    sql: `UPDATE coupons
          SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND is_active = 1
            AND datetime(starts_at) <= datetime('now')
            AND datetime(ends_at) > datetime('now')
            AND (usage_limit IS NULL OR usage_count < usage_limit)`,
    args: [couponId],
  });
  if (!result.rowsAffected) {
    throw new CouponValidationError('This coupon is no longer available. Please review your basket.', 409);
  }
}

async function releaseCouponUsage(db, couponId) {
  await db.execute({
    sql: 'UPDATE coupons SET usage_count = CASE WHEN usage_count > 0 THEN usage_count - 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [couponId],
  });
}

module.exports = {
  CouponValidationError,
  roundMoney,
  calculateDeliveryFee,
  findApplicableCoupon,
  reserveCouponUsage,
  releaseCouponUsage,
};
