const { getDatabaseConnection } = require('../../../config/turso');
const { createHash, randomUUID } = require('node:crypto');
const { generateOrderId, generateCartSnapshot } = require('../../../utils/id-generator');
const { generateNotFoundError, generateValidationError, generateOutOfStockError } = require('../../../utils/error-classes');
const { executeCrossDbSaga } = require('../../../services/db-saga.service');
const { generateWhatsAppMessage } = require('../../../services/whatsapp.service');
const { CouponValidationError, roundMoney, findApplicableCoupon, reserveCouponUsage, releaseCouponUsage } = require('../../../services/coupon.service');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns, ensureOrderReceiptColumns, ensureOrderEditColumns, ensureOrderDeliveryColumns, ensureOrderDeliverySlotColumns, ensureOrderCancellationColumns } = require('./orders.schema');
const { DeliveryQuoteError, quoteDeliveryFee } = require('../../../services/delivery-fee.service');
const { ensureCustomerAccountSchema } = require('../customers/customer-account.schema');
const { calculatePaymentUpdate } = require('../../../services/payment.service');
const { razorpayConfigured, createRazorpayOrder, verifyPaymentSignature, fetchRazorpayPayment, captureRazorpayPayment } = require('../../../services/razorpay-payment.service');
const logger = require('../../../utils/logger');
const getKolkataDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const isOnlinePaymentEnabled = () => razorpayConfigured();
const getOnlinePaymentAvailability = (req, res) => res.json({ success: true, data: { available: isOnlinePaymentEnabled(), provider: 'razorpay', keyId: isOnlinePaymentEnabled() ? process.env.RAZORPAY_KEY_ID.trim() : null } });

const verifyRazorpayPayment = async (req, res) => {
  const orderId = String(req.body?.orderId || '').trim();
  const paymentId = String(req.body?.razorpay_payment_id || '').trim();
  const razorpayOrderId = String(req.body?.razorpay_order_id || '').trim();
  const signature = String(req.body?.razorpay_signature || '').trim();
  if (!orderId || !paymentId || !razorpayOrderId || !signature) {
    return res.status(400).json({ success: false, message: 'Payment verification fields are required.' });
  }
  if (!req.firebaseCustomer?.uid) return res.status(401).json({ success: false, message: 'A verified customer sign-in is required.' });
  try {
    const db = await getDatabaseConnection('orders');
    await ensureOrderPaymentColumns(db);
    const result = await db.execute({
      sql: 'SELECT id, firebase_uid, total_amount, payment_status, gateway_payment_id, razorpay_order_id FROM orders WHERE id = ? AND is_archived = 0',
      args: [orderId],
    });
    const order = result.rows[0];
    if (!order || order.firebase_uid !== req.firebaseCustomer.uid) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.razorpay_order_id !== razorpayOrderId) return res.status(400).json({ success: false, message: 'Payment does not match this RedVeg order.' });
    if (!verifyPaymentSignature({ orderId: razorpayOrderId, paymentId, signature })) {
      return res.status(400).json({ success: false, message: 'Payment signature is invalid.' });
    }

    const amountInPaise = Math.round(Number(order.total_amount) * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 100) return res.status(400).json({ success: false, message: 'Invalid order amount.' });
    if (String(order.payment_status).toLowerCase() === 'paid') {
      if (order.gateway_payment_id !== paymentId) return res.status(409).json({ success: false, message: 'A different payment is already recorded for this order.' });
      return res.status(200).json({ success: true, data: { orderId, paymentStatus: 'paid' } });
    }

    let payment = await fetchRazorpayPayment(paymentId);
    if (payment.order_id !== razorpayOrderId || Number(payment.amount) !== amountInPaise || payment.currency !== 'INR') {
      return res.status(400).json({ success: false, message: 'Razorpay payment details do not match the order.' });
    }
    if (payment.status === 'authorized') payment = await captureRazorpayPayment(paymentId, amountInPaise);
    if (payment.status !== 'captured') return res.status(409).json({ success: false, message: 'Payment is not captured yet. Please wait a moment and check your profile.' });

    await db.execute({
      sql: `UPDATE orders SET payment_status = 'paid', received_amount = ?, balance_amount = 0,
        gateway_payment_id = ?, payment_updated_at = CURRENT_TIMESTAMP, payment_updated_by = 'razorpay-signature', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND razorpay_order_id = ? AND LOWER(COALESCE(payment_status, 'unpaid')) <> 'paid'`,
      args: [Number((amountInPaise / 100).toFixed(2)), paymentId, orderId, razorpayOrderId],
    });
    return res.status(200).json({ success: true, data: { orderId, paymentStatus: 'paid' } });
  } catch (error) {
    logger.error('Razorpay payment verification failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify payment with Razorpay.' });
  }
};

function normalizeOrderSearch(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function orderSearchDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function fuzzyOrderSearchScore(order, query) {
  const queryText = normalizeOrderSearch(query);
  const queryCompact = queryText.replace(/\s/g, '');
  const tokens = queryText.split(/\s+/).filter(Boolean);
  const fields = [order.id, order.customer_name, order.customer_phone].map(value => normalizeOrderSearch(value));
  const compactFields = fields.map(value => value.replace(/\s/g, ''));
  const thresholds = value => value.length >= 8 ? 2 : value.length >= 4 ? 1 : 0;
  let best = Infinity;

  for (let index = 0; index < fields.length; index += 1) {
    const words = fields[index].split(/\s+/).filter(Boolean);
    const fieldCompact = compactFields[index];
    if (queryCompact.length >= 3 && fieldCompact.length >= 3) {
      const distance = orderSearchDistance(queryCompact, fieldCompact);
      if (distance <= thresholds(queryCompact)) best = Math.min(best, distance);
    }
    if (index === 1 && tokens.length) {
      let score = 0;
      const allMatch = tokens.every(token => {
        let nearest = Infinity;
        for (const word of words) {
          if (word.includes(token) || token.includes(word)) nearest = Math.min(nearest, 0);
          else nearest = Math.min(nearest, orderSearchDistance(token, word));
        }
        if (nearest > thresholds(token)) return false;
        score += nearest;
        return true;
      });
      if (allMatch) best = Math.min(best, score);
    }
  }
  return Number.isFinite(best) ? best : null;
}

async function ensureFirebaseOrderUser(db, firebaseCustomer) {
  const uid = String(firebaseCustomer?.uid || '').trim();
  if (!uid) throw new Error('Firebase customer UID is required to create an order');

  // Legacy orders.user_id references users.id. Keep that relationship valid
  // while firebase_uid remains the actual customer identity used by profiles.
  const uidKey = createHash('sha256').update(uid).digest('hex');
  await db.execute({
    sql: `INSERT INTO users (id, username, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'customer')
      ON CONFLICT(id) DO NOTHING`,
    args: [
      uid,
      `firebase_${uidKey}`,
      `firebase-${uidKey}@redveg.invalid`,
      `firebase:${uidKey}`,
      `firebase_auth_managed:${randomUUID()}`,
    ],
  });
  return uid;
}

/**
 * Get all orders with filtering and pagination
 * @route GET /api/v1/orders
 */
const getAllOrders = async (req, res) => {
  try {
    const db = await getDatabaseConnection('orders');
    await ensureOrderPaymentColumns(db);
    await ensureOrderDeliveryColumns(db);
    await ensureOrderDeliverySlotColumns(db);
    await ensureOrderReceiptColumns(db);
    await ensureOrderCancellationColumns(db);

    let baseSql = `SELECT o.* FROM orders o WHERE o.is_archived = 0`;
    const baseArgs = [];

    // Filter by status
    if (req.query.status) {
      const statuses = [...new Set(String(req.query.status).split(',').map(status => status.trim()).filter(Boolean))];
      if (statuses.length) {
        baseSql += ` AND o.status IN (${statuses.map(() => '?').join(', ')})`;
        baseArgs.push(...statuses);
      }
    }

    // Filter by customer_id
    if (req.query.customerId) {
      baseSql += ' AND o.customer_id = ?';
      baseArgs.push(req.query.customerId);
    }

    // Filter by user_id
    if (req.query.userId) {
      baseSql += ' AND o.user_id = ?';
      baseArgs.push(req.query.userId);
    }

    // Filter by date range (from)
    if (req.query.from) {
      baseSql += ' AND o.created_at >= ?';
      baseArgs.push(req.query.from);
    }

    // Filter by date range (to)
    if (req.query.to) {
      baseSql += ' AND o.created_at <= ?';
      baseArgs.push(req.query.to);
    }

    const isCsvExport = String(req.query.format || '').toLowerCase() === 'csv';
    const requestedLimit = parseInt(req.query.limit, 10) || 50;
    const limit = Math.min(requestedLimit, isCsvExport ? 10000 : 200);
    const offset = parseInt(req.query.offset) || 0;
    const query = String(req.query.q || '').trim();
    let result;

    if (query) {
      const phoneDigits = query.replace(/\D/g, '');
      const tokens = phoneDigits.length >= 7
        ? [phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits]
        : [...new Set(normalizeOrderSearch(query).split(/\s+/).filter(Boolean))].slice(0, 8);
      if (!tokens.length) {
        result = { rows: [] };
      } else {
      const phoneExpression = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(o.customer_phone, ''), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')`;
      const searchClause = tokens.map(() => `(LOWER(COALESCE(o.id, '')) LIKE ? OR LOWER(COALESCE(o.customer_name, '')) LIKE ? OR LOWER(${phoneExpression}) LIKE ?)` ).join(' AND ');
      const searchArgs = tokens.flatMap(token => [`%${token}%`, `%${token}%`, `%${token}%`]);
      const exactSql = `${baseSql}${searchClause ? ` AND ${searchClause}` : ''} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
      result = await db.execute({ sql: exactSql, args: [...baseArgs, ...searchArgs, limit, offset] });

      if (!result.rows.length && normalizeOrderSearch(query).replace(/\s/g, '').length >= 3) {
        const candidates = await db.execute({ sql: `${baseSql} ORDER BY o.created_at DESC LIMIT 10000`, args: baseArgs });
        const matches = candidates.rows
          .map(order => ({ order, score: fuzzyOrderSearchScore(order, query) }))
          .filter(match => match.score !== null)
          .sort((left, right) => left.score - right.score || String(right.order.created_at || '').localeCompare(String(left.order.created_at || '')))
          .slice(offset, offset + limit)
          .map(match => match.order);
        result = { rows: matches };
      }
      }
    } else {
      result = await db.execute({
        sql: `${baseSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        args: [...baseArgs, limit, offset],
      });
    }

    // Parse cart snapshot from JSON for each order
    const ordersWithParsedCart = result.rows.map(order => ({
      ...order,
      cart_snapshot: order.cart_snapshot ? JSON.parse(order.cart_snapshot) : []
    }));

    if (isCsvExport) {
      const csvCell = value => {
        let text = value == null ? '' : String(value);
        // Prevent spreadsheet formulas from executing when the file is opened.
        if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const headers = [
        'Order ID', 'Customer', 'Mobile', 'Delivery address', 'Items', 'Subtotal (INR)',
        'Delivery fee (INR)', 'Discount (INR)', 'Total (INR)', 'Payment status',
        'Amount received (INR)', 'Amount due (INR)', 'Order status', 'Placed at',
      ];
      const rows = ordersWithParsedCart.map(order => {
        const items = Array.isArray(order.cart_snapshot) ? order.cart_snapshot.map(item => {
          const title = item.name || item.productName || item.product_name || item.product_id || '';
          const variant = item.variant || item.label || [item.size, item.weight, item.piece_size].filter(Boolean).join(' / ');
          const quantity = Number(item.quantity) || 0;
          return `${title}${variant ? ` (${variant})` : ''} x ${quantity}`;
        }).join('; ') : '';
        return [
          order.id, order.customer_name, order.customer_phone, order.customer_address, items,
          order.subtotal_amount, order.delivery_fee, order.discount_amount, order.total_amount,
          order.payment_status, order.received_amount, order.balance_amount, order.status, order.created_at,
        ].map(csvCell).join(',');
      });
      const date = getKolkataDateString().replace(/-/g, '');
      res.status(200)
        .set('Content-Type', 'text/csv; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="redveg-orders-${date}.csv"`)
        .send(`\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}`);
      return;
    }

    res.status(200).json({
      success: true,
      count: ordersWithParsedCart.length,
      data: ordersWithParsedCart
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get order by ID
 * @route GET /api/v1/orders/:id
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');

    // First, get the order to check if it exists and get its customer_id
    const orderResult = await db.execute({
      sql: 'SELECT o.*, u.username as customer_username FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ? AND o.is_archived = 0',
      args: [id]
    });

    if (orderResult.rows.length === 0) {
      throw generateNotFoundError('Order not found');
    }

    const order = orderResult.rows[0];

    // Check if the order belongs to the authenticated customer
    // For customer token, we check customer_id
    // For admin/user token, we might need to check differently - but let's assume customers only access their own orders
    // Since we're using customer auth middleware for the customer routes, and admin routes are separate,
    // we can check if it's a customer request by looking for req.customer
    if (req.customer) {
      // Customer requesting their own order
      if (order.customer_id !== req.customer.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This order does not belong to you.'
        });
      }
    } else if (req.user) {
      // Admin or user requesting - check if they have permission
      // For simplicity, we'll allow admins to view any order
      // Regular users would need to check user_id, but we're focusing on customer flow
      if (!req.user.isAdminStaff) {
        // For non-admin users, check if it's their order by user_id (if they have one)
        // This maintains backward compatibility for existing user flow
        if (order.user_id !== req.user.userId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. This order does not belong to you.'
          });
        }
      }
      // Admins can view any order
    } else {
      // No authentication - should not happen due to middleware, but just in case
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Parse cart snapshot from JSON
    order.cart_snapshot = order.cart_snapshot ? JSON.parse(order.cart_snapshot) : [];

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Create new order (checkout)
 * @route POST /api/v1/orders/checkout
 */
const createOrder = async (req, res) => {
  let orderId = null;
  let catalogDb = null;
  let ordersDb = null;
  let reservedItems = null;
  let reservedCouponId = null;
  let orderInserted = false;
  let catalogTransaction = null;
  let requestedPaymentMethod = '';
  try {
    const { cartItems, customer } = req.body || {};
    requestedPaymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
    if (!['cash', 'online'].includes(requestedPaymentMethod)) {
      throw generateValidationError('Choose Cash or Online payment.');
    }
    const requestedDeliverySlotId = String(req.body?.deliverySlotId || '').trim();
    const requestedCouponCode = req.body?.couponCode;
    if (requestedCouponCode != null && typeof requestedCouponCode !== 'string') {
      throw generateValidationError('Coupon code must be text');
    }
    let couponCode = typeof requestedCouponCode === 'string' ? requestedCouponCode.trim().toUpperCase() : '';
    const customerId = req.firebaseCustomer?.uid || req.customer?.customerId;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'A verified customer sign-in is required to place this order.' });
    }
    if (requestedPaymentMethod === 'online' && !isOnlinePaymentEnabled()) {
      return res.status(503).json({ success: false, message: 'Online gateway checkout is not configured yet. Please choose Cash.' });
    }
    const couponCustomerKey = req.firebaseCustomer?.uid
      ? `firebase:${req.firebaseCustomer.uid}`
      : `customer:${req.customer.customerId}`;

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw generateValidationError('Cart items are required');
    }

    // Validate each cart item
    for (const item of cartItems) {
      if (typeof item.productId !== 'string' || !item.productId || typeof item.variantId !== 'string' || !item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw generateValidationError('Invalid cart item format');
      }
    }

    catalogDb = await getDatabaseConnection('catalog');
    ordersDb = await getDatabaseConnection('orders');
    const customerDb = req.customer ? await getDatabaseConnection('customer') : null;
    await ensureCustomerAccountSchema(ordersDb);
    await ensureOrderCouponColumns(ordersDb);
    await ensureOrderPaymentColumns(ordersDb);
    await ensureOrderDeliveryColumns(ordersDb);
    await ensureOrderDeliverySlotColumns(ordersDb);
    if (!requestedDeliverySlotId) throw generateValidationError('Choose an available delivery slot before placing your order.');
    const deliverySlotResult = await catalogDb.execute({
      sql: 'SELECT id, name, start_time, end_time FROM delivery_slots WHERE id = ? AND is_active = 1',
      args: [requestedDeliverySlotId],
    });
    if (!deliverySlotResult.rows.length) {
      return res.status(409).json({ success: false, message: 'That delivery slot is no longer available. Choose another active slot.' });
    }
    const deliverySlot = deliverySlotResult.rows[0];
    const deliverySlotName = String(deliverySlot.name);
    const deliverySlotTime = `${String(deliverySlot.start_time)}-${String(deliverySlot.end_time)}`;

    let customerDetails = customer;
    if (req.customer) {
      const customerResult = await customerDb.execute({ sql: 'SELECT name, address, phone_no AS phoneNo FROM customers WHERE customer_id = ?', args: [customerId] });
      if (customerResult.rows.length === 0) throw generateNotFoundError('Customer not found');
      customerDetails = customerResult.rows[0];
    }
    if (!customerDetails?.name || !customerDetails?.phoneNo || !customerDetails?.address) throw generateValidationError('Customer name, phone number, and address are required');

    // Generate order ID
    orderId = generateOrderId();

    // Re-read live catalog prices and reserve stock/coupon usage under one catalog transaction.
    let cartSnapshot = [];
    let subtotalAmount = 0;
    let discountAmount = 0;
    let deliveryFee = 0;
    let deliveryDistanceKm = 0;
    let deliveryRatePerKm = 10;
    let totalAmount = 0;
    let finalDeliveryQuote;
    const deliveryDestination = req.body?.deliveryDestination || {};
    finalDeliveryQuote = await quoteDeliveryFee(deliveryDestination, { requireExactAddress: true });
    deliveryFee = finalDeliveryQuote.deliveryFee;
    deliveryDistanceKm = finalDeliveryQuote.distanceKm;
    deliveryRatePerKm = finalDeliveryQuote.ratePerKm;
    catalogTransaction = await catalogDb.transaction('write');
    try {
      try {
        cartSnapshot = await generateCartSnapshot(cartItems, catalogTransaction);
      } catch (error) {
        if (/Product or variant not found/i.test(String(error.message))) {
          throw generateNotFoundError('One or more basket items are no longer available');
        }
        throw error;
      }
      subtotalAmount = roundMoney(cartSnapshot.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
      if (!Number.isFinite(subtotalAmount) || subtotalAmount <= 0) throw generateValidationError('The basket total must be greater than zero');
      if (couponCode) {
        const quote = await findApplicableCoupon(catalogTransaction, couponCode, subtotalAmount, {
          id: customerId,
          key: couponCustomerKey,
          ordersDb,
        });
        couponCode = quote.code;
        discountAmount = quote.discountAmount;
        reservedCouponId = quote.couponId;
        await reserveCouponUsage(catalogTransaction, reservedCouponId, couponCustomerKey, orderId);
      }

      totalAmount = roundMoney(Math.max(0, subtotalAmount - discountAmount) + deliveryFee);

      for (const item of cartItems) {
        const result = await catalogTransaction.execute({ sql: 'UPDATE variants SET stock_count = stock_count - ? WHERE id = ? AND product_id = ? AND stock_count >= ? AND is_available = 1', args: [item.quantity, item.variantId, item.productId, item.quantity] });
        if (!result.rowsAffected) throw generateOutOfStockError(`Insufficient stock for ${item.variantId}`);
        await catalogTransaction.execute({ sql: 'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (SELECT COALESCE(SUM(stock_count), 0) FROM variants WHERE product_id = ?) = 0', args: [item.productId, item.productId] });
      }
      await catalogTransaction.commit();
      catalogTransaction = null;
      reservedItems = cartItems.map((item) => ({ ...item }));
    } catch (error) {
      try { await catalogTransaction?.rollback(); } catch (rollbackError) { logger.error('Error rolling back checkout reservation:', rollbackError); }
      catalogTransaction = null;
      reservedCouponId = null;
      throw error;
    }

    // Create pending order in ordersDb
    const orderUserId = req.firebaseCustomer
      ? await ensureFirebaseOrderUser(ordersDb, req.firebaseCustomer)
      : customerId;
    await ordersDb.execute({
      sql: `
        INSERT INTO orders (
          id, user_id, customer_id, firebase_uid, cart_snapshot, total_amount, customer_name,
          customer_phone, customer_address, coupon_id, coupon_code, subtotal_amount, payment_method,
          discount_amount, delivery_fee, payment_status, received_amount, balance_amount,
          delivery_distance_km, delivery_rate_per_km, delivery_origin_latitude, delivery_origin_longitude,
          delivery_destination_latitude, delivery_destination_longitude, delivery_distance_method,
          delivery_distance_provider, delivery_origin_address, delivery_matched_address,
          payment_updated_at, payment_updated_by,
          delivery_slot_id, delivery_slot_name, delivery_slot_time, status, is_archived, order_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)
      `,
      args: [
        orderId,
        orderUserId,
        req.customer?.customerId || null,
        req.firebaseCustomer?.uid || null,
        JSON.stringify(cartSnapshot),
        totalAmount,
        customerDetails.name,
        customerDetails.phoneNo,
        customerDetails.address,
        reservedCouponId,
        couponCode || null,
        subtotalAmount,
        requestedPaymentMethod,
        discountAmount,
        deliveryFee,
        totalAmount,
        deliveryDistanceKm,
        deliveryRatePerKm,
        finalDeliveryQuote.originLatitude,
        finalDeliveryQuote.originLongitude,
        finalDeliveryQuote.destinationLatitude,
        finalDeliveryQuote.destinationLongitude,
        finalDeliveryQuote.distanceMethod,
        finalDeliveryQuote.distanceProvider,
        finalDeliveryQuote.originAddress,
        finalDeliveryQuote.matchedDestinationAddress,
        requestedDeliverySlotId,
        deliverySlotName,
        deliverySlotTime,
      ]
    });
    orderInserted = true;

    let checkoutUrl = null;
    let razorpayCheckout = null;
    if (requestedPaymentMethod === 'online') {
      const razorpayOrder = await createRazorpayOrder({ orderId, amount: totalAmount });
      razorpayCheckout = {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID.trim(),
      };
      await ordersDb.execute({
        sql: 'UPDATE orders SET razorpay_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [razorpayOrder.id, orderId],
      });
    }

    logger.info(`Order created: ${orderId} for customer ${customerId}`);

    // Generate WhatsApp message for customer
    const whatsappMessage = generateWhatsAppMessage({
      orderId,
      customerName: customerDetails.name,
      customerPhone: customerDetails.phoneNo || customerDetails.phone_no,
      customerAddress: customerDetails.address,
      cartItems: cartSnapshot,
      totalAmount,
      subtotalAmount,
      discountAmount,
      deliveryFee,
      deliveryDistanceKm,
      deliveryRatePerKm,
      deliverySlotName,
      deliverySlotTime,
      paymentMethod: requestedPaymentMethod,
      couponCode,
    });

    // A successfully placed order ends the customer's active cart. Keep this
    // cleanup best-effort so a cart-table hiccup cannot fail a valid order.
    if (req.firebaseCustomer?.uid) {
      try {
        await ordersDb.execute({
          sql: 'DELETE FROM customer_active_carts WHERE firebase_uid = ?',
          args: [req.firebaseCustomer.uid],
        });
      } catch (cartCleanupError) {
        logger.warn(`Unable to clear active cart after order ${orderId}: ${cartCleanupError.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId,
        status: 'pending',
        whatsappMessage,
        subtotalAmount,
        discountAmount,
        deliveryFee,
        deliveryDistanceKm,
        deliveryRatePerKm,
        couponCode: couponCode || null,
        totalAmount,
        checkoutUrl,
        razorpayCheckout,
      }
    });
  } catch (error) {
    // If an inserted order is removed after an error, release its reservations too.
    let orderRemoved = !orderInserted;
    if (orderId && orderInserted && ordersDb) {
      try {
        const cleanup = await ordersDb.execute({
          sql: 'DELETE FROM orders WHERE id = ?',
          args: [orderId]
        });
        orderRemoved = Boolean(cleanup.rowsAffected);
      } catch (cleanupError) {
        logger.error(`Error cleaning up order ${orderId}:`, cleanupError);
      }
    }

    if (reservedItems && orderRemoved && catalogDb) {
      let compensationTransaction = null;
      try {
        compensationTransaction = await catalogDb.transaction('write');
        for (const item of reservedItems) {
          await compensationTransaction.execute({ sql: 'UPDATE variants SET stock_count = stock_count + ? WHERE id = ? AND product_id = ?', args: [item.quantity, item.variantId, item.productId] });
        }
        if (reservedCouponId) await releaseCouponUsage(compensationTransaction, reservedCouponId, orderId);
        await compensationTransaction.commit();
      } catch (compensationError) {
        try { await compensationTransaction?.rollback(); } catch { /* Keep the original checkout error. */ }
        logger.error(`Error restoring checkout reservations for ${orderId || 'unassigned order'}:`, compensationError);
      }
    }

    if (error instanceof DeliveryQuoteError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    if (error instanceof CouponValidationError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }

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

    if (error.type === 'out-of-stock') {
      return res.status(409).json({ success: false, message: error.message });
    }

    if (requestedPaymentMethod === 'online' && Number(error.statusCode) === 401) {
      logger.error('Razorpay rejected the configured API credentials.');
      return res.status(401).json({ success: false, message: 'Razorpay authentication failed. Please contact support.' });
    }

    logger.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Approve order (Admin only) - executes cross-DB saga
 * @route PATCH /api/v1/orders/:id/approve
 */
const approveOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId; // From auth middleware

    logger.info(`Admin ${adminId} attempting to approve order ${id}`);

    const ordersDb = await getDatabaseConnection('orders');
    await ensureOrderCouponColumns(ordersDb);
    await ensureOrderPaymentColumns(ordersDb);
    await ensureOrderReceiptColumns(ordersDb);
    const receiptNumber = `RV-${randomUUID().replace(/-/g, '').toUpperCase()}`;
    const result = await ordersDb.execute({
      sql: "UPDATE orders SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, receipt_number = COALESCE(receipt_number, ?), receipt_issued_at = COALESCE(receipt_issued_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0 AND LOWER(status) IN ('pending', 'new')",
      args: [adminId, receiptNumber, id]
    });
    if (!result.rowsAffected) throw generateValidationError('Order is not pending or has already been processed');

    const approvedOrder = await ordersDb.execute({
      sql: 'SELECT receipt_number, receipt_issued_at FROM orders WHERE id = ?',
      args: [id],
    });
    const receipt = approvedOrder.rows[0] || {};

    res.status(200).json({
      success: true,
      message: 'Order approved successfully',
      data: {
        orderId: id,
        status: 'approved',
        approvedBy: adminId,
        receiptNumber: receipt.receipt_number,
        receiptIssuedAt: receipt.receipt_issued_at,
      }
    });
  } catch (error) {
    logger.error('Error approving order:', error);

    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'out-of-stock') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get customer's order history (last 30 days)
 * @route GET /api/v1/orders/customer/orders
 */
const getUserOrders = async (req, res) => {
  try {
    // Get customer ID from authenticated customer
    const { customerId } = req.customer;

    const db = await getDatabaseConnection('orders');

    // Get customer's orders from the last 30 days
    const result = await db.execute({
      sql: `
        SELECT id, total_amount, customer_name, status, created_at
        FROM orders
        WHERE customer_id = ?
          AND is_archived = 0
          AND created_at >= date('now', '-30 days')
        ORDER BY created_at DESC
      `,
      args: [customerId]
    });

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching customer orders:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Archive/delete order (Admin only)
 * @route DELETE /api/v1/orders/:id
 */
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');
    await ensureOrderCouponColumns(db);
    const order = await db.execute({ sql: "SELECT coupon_id FROM orders WHERE id = ? AND is_archived = 0 AND LOWER(status) IN ('pending', 'new')", args: [id] });
    const result = await db.execute({ sql: "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0 AND LOWER(status) IN ('pending', 'new')", args: [id] });
    if (!result.rowsAffected) throw generateNotFoundError('Pending order not found');
    const couponId = order.rows[0]?.coupon_id;
    if (couponId) {
      try {
        const catalogDb = await getDatabaseConnection('catalog');
        const couponTransaction = await catalogDb.transaction('write');
        try {
          await releaseCouponUsage(couponTransaction, couponId, id);
          await couponTransaction.commit();
        } catch (error) {
          await couponTransaction.rollback();
          throw error;
        }
      } catch (couponReleaseError) {
        logger.error(`Unable to release coupon use for cancelled order ${id}:`, couponReleaseError);
      }
    }
    res.status(200).json({ success: true, data: { id, status: 'cancelled' } });
  } catch (error) {
    if (error.type === 'not-found') return res.status(404).json({ success: false, message: error.message });
    logger.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateOrderStatus = async (req, res) => {
  const statusTransitions = {
    processing: ['approved', 'confirmed'],
    out_for_delivery: ['processing'],
    delivered: ['out_for_delivery', 'approved', 'confirmed']
  };

  const nextStatus = typeof req.body?.status === 'string'
    ? req.body.status.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : '';
  const previousStatuses = Object.prototype.hasOwnProperty.call(statusTransitions, nextStatus)
    ? statusTransitions[nextStatus]
    : null;

  if (!previousStatuses) {
    return res.status(400).json({
      success: false,
      message: 'Status must be processing, out_for_delivery, or delivered'
    });
  }

  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');
    await ensureOrderCancellationColumns(db);
    const order = await db.execute({
      sql: 'SELECT status, cancellation_status FROM orders WHERE id = ? AND is_archived = 0',
      args: [id]
    });

    if (!order.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.rows[0].cancellation_status || '').toLowerCase() === 'requested') {
      return res.status(409).json({ success: false, message: 'This order has a pending customer cancellation request. Review it before changing the fulfilment status.' });
    }

    const currentStatus = String(order.rows[0].status).toLowerCase();
    if (!previousStatuses.includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        message: `Order cannot move from ${currentStatus} to ${nextStatus}`
      });
    }

    const result = await db.execute({
      sql: `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0 AND LOWER(status) IN (${previousStatuses.map(() => '?').join(', ')}) AND LOWER(COALESCE(cancellation_status, 'none')) <> 'requested'`,
      args: [nextStatus, id, ...previousStatuses]
    });

    if (!result.rowsAffected) {
      return res.status(409).json({ success: false, message: 'Order status changed; refresh and try again' });
    }

    return res.status(200).json({
      success: true,
      data: { id, status: nextStatus }
    });
  } catch (error) {
    logger.error('Error updating order status:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const reviewOrderCancellation = async (req, res) => {
  const orderId = String(req.params.id || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!['approve', 'decline'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Choose approve or decline for this cancellation request.' });
  }

  let catalogDb;
  let catalogTransaction = null;
  let catalogTransactionOpen = false;
  let orderMarkedCancelled = false;
  let originalOrderStatus = 'approved';
  try {
    const ordersDb = await getDatabaseConnection('orders');
    await ensureOrderCancellationColumns(ordersDb);
    const result = await ordersDb.execute({
      sql: `SELECT id, status, cancellation_status, cancellation_message, cart_snapshot,
        coupon_id FROM orders WHERE id = ? AND COALESCE(is_archived, 0) = 0`,
      args: [orderId],
    });
    const order = result.rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (String(order.cancellation_status || '').toLowerCase() !== 'requested') {
      return res.status(409).json({ success: false, message: 'There is no pending cancellation request for this order.' });
    }

    if (action === 'decline') {
      const declined = await ordersDb.execute({
        sql: `UPDATE orders SET cancellation_status = 'declined',
          cancellation_reviewed_at = CURRENT_TIMESTAMP, cancellation_reviewed_by = ?,
          cancellation_review_note = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND COALESCE(is_archived, 0) = 0
            AND LOWER(cancellation_status) = 'requested'
            AND LOWER(status) IN ('approved', 'confirmed', 'processing')`,
        args: [req.user?.userId || null, note || null, orderId],
      });
      if (!declined.rowsAffected) return res.status(409).json({ success: false, message: 'The order changed while this request was being reviewed. Refresh and try again.' });
      return res.status(200).json({ success: true, data: { orderId, status: order.status, cancellationStatus: 'declined', reviewNote: note || null } });
    }

    const normalizedOrderStatus = String(order.status || '').toLowerCase();
    originalOrderStatus = normalizedOrderStatus;
    if (!['approved', 'confirmed', 'processing'].includes(normalizedOrderStatus)) {
      return res.status(409).json({ success: false, message: 'This order can no longer be cancelled.' });
    }
    let items;
    try {
      items = typeof order.cart_snapshot === 'string' ? JSON.parse(order.cart_snapshot) : order.cart_snapshot;
    } catch {
      return res.status(409).json({ success: false, message: 'Order items are malformed; inventory was not changed.' });
    }
    if (!Array.isArray(items)) return res.status(409).json({ success: false, message: 'Order items are unavailable; inventory was not changed.' });

    catalogDb = await getDatabaseConnection('catalog');
    await catalogDb.execute(`CREATE TABLE IF NOT EXISTS order_cancellation_inventory_releases (
      order_id TEXT PRIMARY KEY,
      coupon_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    catalogTransaction = await catalogDb.transaction('write');
    catalogTransactionOpen = true;
    const releaseResult = await catalogTransaction.execute({
      sql: 'SELECT order_id FROM order_cancellation_inventory_releases WHERE order_id = ?',
      args: [orderId],
    });
    if (!releaseResult.rows.length) {
      for (const item of items) {
        const productId = String(item?.productId || item?.product_id || '').trim();
        const variantId = String(item?.variantId || item?.variant_id || '').trim();
        const quantity = Number(item?.quantity);
        if (!productId || !variantId || !Number.isInteger(quantity) || quantity < 1) {
          throw new Error(`Order ${orderId} contains an invalid item; inventory was not changed.`);
        }
        const restored = await catalogTransaction.execute({
          sql: 'UPDATE variants SET stock_count = stock_count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND product_id = ?',
          args: [quantity, variantId, productId],
        });
        if (!restored.rowsAffected) throw new Error(`Could not restore inventory for variant ${variantId}.`);
      }
      if (order.coupon_id) await releaseCouponUsage(catalogTransaction, order.coupon_id, orderId);
      await catalogTransaction.execute({
        sql: 'INSERT INTO order_cancellation_inventory_releases (order_id, coupon_id) VALUES (?, ?)',
        args: [orderId, order.coupon_id || null],
      });
    }

    const approved = await ordersDb.execute({
      sql: `UPDATE orders SET status = 'cancelled', cancellation_status = 'approved',
        cancellation_reviewed_at = CURRENT_TIMESTAMP, cancellation_reviewed_by = ?,
        cancellation_review_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(is_archived, 0) = 0
          AND LOWER(cancellation_status) = 'requested'
          AND LOWER(status) IN ('approved', 'confirmed', 'processing')`,
      args: [req.user?.userId || null, note || null, orderId],
    });
    if (!approved.rowsAffected) {
      await catalogTransaction.rollback();
      catalogTransaction = null;
      catalogTransactionOpen = false;
      return res.status(409).json({ success: false, message: 'The order changed while this request was being reviewed. No inventory was changed.' });
    }
    orderMarkedCancelled = true;
    await catalogTransaction.commit();
    catalogTransaction = null;
    catalogTransactionOpen = false;
    return res.status(200).json({ success: true, data: { orderId, status: 'cancelled', cancellationStatus: 'approved', reviewNote: note || null } });
  } catch (error) {
    if (catalogTransactionOpen) {
      try { await catalogTransaction?.rollback(); } catch (rollbackError) { logger.error(`Unable to roll back cancellation inventory for order ${orderId}:`, rollbackError); }
    }
    if (orderMarkedCancelled) {
      try {
        const ordersDb = await getDatabaseConnection('orders');
        await ordersDb.execute({
          sql: `UPDATE orders SET status = ?, cancellation_status = 'requested',
            cancellation_reviewed_at = NULL, cancellation_reviewed_by = NULL,
            cancellation_review_note = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND LOWER(cancellation_status) = 'approved' AND LOWER(status) = 'cancelled'`,
          args: [originalOrderStatus, orderId],
        });
      } catch (compensationError) {
        logger.error(`Unable to restore cancellation request state for order ${orderId}:`, compensationError);
      }
    }
    logger.error(`Error reviewing cancellation request for order ${orderId}:`, error);
    return res.status(500).json({ success: false, message: 'Unable to complete this cancellation review. No success was recorded; refresh the order and try again.' });
  }
};

// Replace the items in an order before it is out for delivery. The database
// snapshot is the source of truth for both the admin order view and receipts.
const updateOrderItems = async (req, res) => {
  const { id } = req.params;
  const requestedItems = req.body?.items;
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 50) {
    return res.status(400).json({ success: false, message: 'Add between 1 and 50 order items.' });
  }

  const quantities = new Map();
  for (const item of requestedItems) {
    const productId = String(item?.productId || '').trim();
    const variantId = String(item?.variantId || '').trim();
    const quantity = Number(item?.quantity);
    if (!productId || !variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ success: false, message: 'Each item needs a valid product, variant, and quantity from 1 to 99.' });
    }
    const key = `${productId}\u0000${variantId}`;
    quantities.set(key, { productId, variantId, quantity: (quantities.get(key)?.quantity || 0) + quantity });
    if (quantities.get(key).quantity > 99) {
      return res.status(400).json({ success: false, message: 'A variant quantity cannot exceed 99.' });
    }
  }

  let catalogDb;
  let catalogTransaction = null;
  let catalogTransactionOpen = false;
  let stockDeltas = [];
  let stockCommitted = false;
  try {
    const ordersDb = await getDatabaseConnection('orders');
    await ensureOrderCouponColumns(ordersDb);
    await ensureOrderPaymentColumns(ordersDb);
    await ensureOrderEditColumns(ordersDb);
    await ensureOrderDeliveryColumns(ordersDb);
    await ensureOrderCancellationColumns(ordersDb);
    const existingResult = await ordersDb.execute({
      sql: 'SELECT id, status, cancellation_status, cart_snapshot, subtotal_amount, discount_amount, delivery_fee, delivery_distance_km, delivery_rate_per_km, coupon_code, received_amount FROM orders WHERE id = ? AND is_archived = 0',
      args: [id],
    });
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found.' });
    const status = String(existing.status || '').toLowerCase();
    if (String(existing.cancellation_status || '').toLowerCase() === 'requested') {
      return res.status(409).json({ success: false, message: 'This order has a pending cancellation request. Review it before editing the items.' });
    }
    if (!['pending', 'new', 'approved', 'confirmed', 'processing'].includes(status)) {
      return res.status(409).json({ success: false, message: 'Items can only be edited before the order is out for delivery.' });
    }

    let oldSnapshot;
    try {
      oldSnapshot = typeof existing.cart_snapshot === 'string' ? JSON.parse(existing.cart_snapshot) : existing.cart_snapshot;
    } catch {
      oldSnapshot = [];
    }
    if (!Array.isArray(oldSnapshot)) oldSnapshot = [];
    const oldItems = new Map();
    for (const item of oldSnapshot) {
      const productId = String(item.productId || item.product_id || '');
      const variantId = String(item.variantId || item.variant_id || '');
      const key = `${productId}\u0000${variantId}`;
      const prior = oldItems.get(key);
      if (prior) prior.quantity += Number(item.quantity) || 0;
      else oldItems.set(key, { ...item, productId, variantId, quantity: Number(item.quantity) || 0 });
    }

    catalogDb = await getDatabaseConnection('catalog');
    const newSnapshot = [];
    for (const [key, item] of quantities) {
      const prior = oldItems.get(key);
      if (prior) {
        newSnapshot.push({ ...prior, productId: item.productId, variantId: item.variantId, quantity: item.quantity });
      } else {
        const result = await catalogDb.execute({
          sql: `SELECT p.name, p.is_active, v.id AS variant_id, v.sku, v.size, v.weight, v.piece_size, v.price, v.is_available
            FROM products p JOIN variants v ON v.product_id = p.id WHERE p.id = ? AND v.id = ?`,
          args: [item.productId, item.variantId],
        });
        const product = result.rows[0];
        if (!product) return res.status(409).json({ success: false, message: 'One of the added products or variants no longer exists in the catalog.' });
        if (Number(product.is_active) !== 1) return res.status(409).json({ success: false, message: `${product.name} is currently inactive in the catalog. Choose an active product.` });
        if (Number(product.is_available) !== 1) return res.status(409).json({ success: false, message: `A selected variant of ${product.name} is currently unavailable.` });
        newSnapshot.push({
          productId: item.productId,
          variantId: item.variantId,
          name: product.name,
          sku: product.sku,
          size: product.size,
          weight: product.weight,
          piece_size: product.piece_size || null,
          variant: [product.size, product.weight, product.piece_size].filter(Boolean).join(' / '),
          price: Number(product.price),
          quantity: item.quantity,
        });
      }
    }

    const previousTotalQuantities = new Map([...oldItems].map(([key, item]) => [key, item.quantity]));
    stockDeltas = [...new Set([...previousTotalQuantities.keys(), ...quantities.keys()])].map((key) => {
      const productId = quantities.get(key)?.productId || oldItems.get(key)?.productId;
      const variantId = quantities.get(key)?.variantId || oldItems.get(key)?.variantId;
      return { productId, variantId, delta: (quantities.get(key)?.quantity || 0) - (previousTotalQuantities.get(key) || 0) };
    }).filter((entry) => entry.delta !== 0);

    catalogTransaction = await catalogDb.transaction('write');
    catalogTransactionOpen = true;
    for (const change of stockDeltas) {
      const current = await catalogTransaction.execute({
        sql: `SELECT v.stock_count, v.is_available, p.is_active FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.product_id = ?`,
        args: [change.variantId, change.productId],
      });
      const variant = current.rows[0];
      if (!variant) throw generateValidationError(`Variant ${change.variantId} no longer exists.`);
      if (change.delta > 0) {
        if (Number(variant.is_available) !== 1 || Number(variant.is_active) !== 1 || Number(variant.stock_count) < change.delta) {
          throw generateOutOfStockError(`Not enough stock available for ${newSnapshot.find((item) => item.variantId === change.variantId)?.name || change.variantId}.`);
        }
        const updated = await catalogTransaction.execute({
          sql: 'UPDATE variants SET stock_count = stock_count - ? WHERE id = ? AND product_id = ? AND stock_count >= ? AND is_available = 1',
          args: [change.delta, change.variantId, change.productId, change.delta],
        });
        if (!updated.rowsAffected) throw generateOutOfStockError(`Stock changed for ${change.variantId}. Refresh and try again.`);
      } else {
        await catalogTransaction.execute({
          sql: 'UPDATE variants SET stock_count = stock_count + ? WHERE id = ? AND product_id = ?',
          args: [-change.delta, change.variantId, change.productId],
        });
      }
    }

    const subtotal = roundMoney(newSnapshot.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
    const discount = roundMoney(Math.min(subtotal, Math.max(0, Number(existing.discount_amount) || 0)));
    const deliveryFee = roundMoney(Number(existing.delivery_fee) || 0);
    const total = roundMoney(Math.max(0, subtotal - discount) + deliveryFee);
    const received = roundMoney(Math.max(0, Number(existing.received_amount) || 0));
    const due = roundMoney(Math.max(0, total - received));
    const paymentStatus = received >= total ? 'paid' : received > 0 ? 'partial' : 'unpaid';

    await catalogTransaction.commit();
    catalogTransaction = null;
    catalogTransactionOpen = false;
    stockCommitted = true;

    const update = await ordersDb.execute({
      sql: `UPDATE orders SET cart_snapshot = ?, subtotal_amount = ?, discount_amount = ?, delivery_fee = ?,
        total_amount = ?, balance_amount = ?, payment_status = ?, coupon_code = ?,
        items_updated_by = ?, items_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_archived = 0 AND cart_snapshot = ? AND LOWER(status) IN ('pending', 'new', 'approved', 'confirmed', 'processing') AND LOWER(COALESCE(cancellation_status, 'none')) <> 'requested'`,
      args: [JSON.stringify(newSnapshot), subtotal, discount, deliveryFee, total, due, paymentStatus,
        existing.coupon_code || null, req.user?.userId || null, id, existing.cart_snapshot],
    });
    if (!update.rowsAffected) throw Object.assign(new Error('Order changed while you were editing. Reload it and try again.'), { statusCode: 409 });

    return res.status(200).json({
      success: true,
      message: 'Order items saved to the database.',
      data: { id, items: newSnapshot, subtotalAmount: subtotal, discountAmount: discount, deliveryFee, deliveryDistanceKm: Number(existing.delivery_distance_km) || 0, deliveryRatePerKm: Number(existing.delivery_rate_per_km) || 10, totalAmount: total, paymentStatus, receivedAmount: received, dueAmount: due },
    });
  } catch (error) {
    if (catalogTransactionOpen) {
      try { await catalogTransaction?.rollback(); } catch (rollbackError) { logger.error('Unable to roll back order stock changes:', rollbackError); }
      catalogTransaction = null;
    } else if (stockCommitted && catalogDb) {
      let compensationTransaction;
      try {
        compensationTransaction = await catalogDb.transaction('write');
        for (const change of stockDeltas) {
          if (change.delta > 0) {
            await compensationTransaction.execute({ sql: 'UPDATE variants SET stock_count = stock_count + ? WHERE id = ? AND product_id = ?', args: [change.delta, change.variantId, change.productId] });
          } else {
            await compensationTransaction.execute({ sql: 'UPDATE variants SET stock_count = stock_count - ? WHERE id = ? AND product_id = ? AND stock_count >= ?', args: [-change.delta, change.variantId, change.productId, -change.delta] });
          }
        }
        await compensationTransaction.commit();
      } catch (compensationError) {
        try { await compensationTransaction?.rollback(); } catch {}
        logger.error(`Order edit stock compensation failed for ${id}:`, compensationError);
      }
    }
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
    if (error.type === 'out-of-stock') return res.status(409).json({ success: false, message: error.message });
    logger.error(`Error updating items for order ${id}:`, error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Unable to save order changes.' });
  }
};

const updateOrderPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');
    await ensureOrderPaymentColumns(db);
    const existing = await db.execute({
      sql: 'SELECT total_amount, status FROM orders WHERE id = ? AND is_archived = 0',
      args: [id],
    });
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Order not found' });
    if (String(existing.rows[0].status || '').toLowerCase() === 'cancelled') {
      return res.status(409).json({ success: false, message: 'Cancelled orders cannot be updated as payments' });
    }

    const totalAmount = Number(existing.rows[0].total_amount);
    let payment;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'receivedAmount')) {
      const receivedAmount = Number(req.body.receivedAmount);
      if (!Number.isFinite(receivedAmount) || receivedAmount < 0 || receivedAmount > totalAmount) {
        throw Object.assign(new Error('Amount paid must be between zero and the order total'), { type: 'validation-error' });
      }
      const dueAmount = Number((totalAmount - receivedAmount).toFixed(2));
      payment = calculatePaymentUpdate(totalAmount, req.body?.paymentStatus, dueAmount);
    } else {
      // Keep accepting dueAmount from older admin clients while they update.
      payment = calculatePaymentUpdate(totalAmount, req.body?.paymentStatus, req.body?.dueAmount);
    }
    const result = await db.execute({
      sql: `UPDATE orders SET payment_status = ?, received_amount = ?, balance_amount = ?,
        payment_updated_at = CURRENT_TIMESTAMP, payment_updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_archived = 0 AND LOWER(status) <> 'cancelled'`,
      args: [payment.paymentStatus, payment.receivedAmount, payment.dueAmount, req.user?.userId || null, id],
    });
    if (!result.rowsAffected) return res.status(409).json({ success: false, message: 'Order payment changed; refresh and try again' });
    return res.status(200).json({
      success: true,
      data: {
        id,
        paymentStatus: payment.paymentStatus,
        receivedAmount: payment.receivedAmount,
        dueAmount: payment.dueAmount,
      },
    });
  } catch (error) {
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
    logger.error('Error updating order payment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDatabaseConnection('orders');

    // Check if order exists
    const orderResult = await db.execute({
      sql: 'SELECT id FROM orders WHERE id = ? AND is_archived = 0',
      args: [id]
    });

    if (orderResult.rows.length === 0) {
      throw generateNotFoundError('Order not found');
    }

    // Soft delete - set is_archived to 1
    await db.execute({
      sql: 'UPDATE orders SET is_archived = 1 WHERE id = ?',
      args: [id]
    });

    logger.info(`Order archived: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Order archived successfully'
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error archiving order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getOnlinePaymentAvailability,
  verifyRazorpayPayment,
  createOrder,
  getOrderById,
  approveOrder,
  getUserOrders,
  getAllOrders,
  cancelOrder,
  updateOrderStatus,
  updateOrderItems,
  updateOrderPayment,
  reviewOrderCancellation,
  deleteOrder
};

