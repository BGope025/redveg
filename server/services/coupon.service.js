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

async function hasCustomerRedeemedCoupon(db, coupon, customerKey, customerId, ordersDb) {
  await ensureCouponSchema(db);
  const redemption = await db.execute({
    sql: 'SELECT order_id FROM coupon_redemptions WHERE coupon_id = ? AND customer_key = ? LIMIT 1',
    args: [String(coupon.id), customerKey],
  });
  if (redemption.rows.length) return true;
  if (!ordersDb || !customerId) return false;

  const isFirebaseIdentity = customerKey.startsWith('firebase:');
  const identityPredicate = isFirebaseIdentity
    ? '(firebase_uid = ? OR user_id = ?)'
    : '(customer_id = ? OR user_id = ?)';
  const previousOrder = await ordersDb.execute({
    sql: `SELECT id FROM orders
          WHERE (coupon_id = ? OR UPPER(TRIM(COALESCE(coupon_code, ''))) = ?)
            AND ${identityPredicate}
            AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('cancelled', 'canceled')
          LIMIT 1`,
    args: [String(coupon.id), String(coupon.code).toUpperCase(), customerId, customerId],
  });
  return previousOrder.rows.length > 0;
}

async function findApplicableCoupon(db, code, subtotal, customer = null, policyOverride = null) {
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
  if (customer?.key && await hasCustomerRedeemedCoupon(
    db,
    coupon,
    customer.key,
    customer.id,
    customer.ordersDb
  )) {
    throw new CouponValidationError('You have already used this coupon. Each customer can use it once.');
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

async function reserveCouponUsage(db, couponId, customerKey, orderId) {
  const result = await db.execute({
    sql: `UPDATE coupons
          SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND is_active = 1
            AND julianday(starts_at) <= julianday('now')
            AND julianday(ends_at) > julianday('now')
            AND (usage_limit IS NULL OR usage_count < usage_limit)`,
    args: [couponId],
  });
  if (!result.rowsAffected) {
    throw new CouponValidationError('This coupon is no longer available. Please review your basket.', 409);
  }
  if (customerKey && orderId) {
    try {
      await db.execute({
        sql: 'INSERT INTO coupon_redemptions (coupon_id, customer_key, order_id) VALUES (?, ?, ?)',
        args: [couponId, customerKey, orderId],
      });
    } catch (error) {
      if (/unique constraint failed: coupon_redemptions\.(coupon_id|order_id)/i.test(String(error.message))) {
        throw new CouponValidationError('You have already used this coupon. Each customer can use it once.', 409);
      }
      throw error;
    }
  }
}

async function releaseCouponUsage(db, couponId, orderId = null) {
  if (orderId) {
    await db.execute({
      sql: 'DELETE FROM coupon_redemptions WHERE coupon_id = ? AND order_id = ?',
      args: [couponId, orderId],
    });
  }
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
  hasCustomerRedeemedCoupon,
  reserveCouponUsage,
  releaseCouponUsage,
};
