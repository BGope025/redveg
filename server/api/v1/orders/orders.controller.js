const { getDatabaseConnection } = require('../../../config/turso');
const { generateOrderId, generateCartSnapshot } = require('../../../utils/id-generator');
const { generateNotFoundError, generateValidationError, generateOutOfStockError } = require('../../../utils/error-classes');
const { executeCrossDbSaga } = require('../../../services/db-saga.service');
const { generateWhatsAppMessage } = require('../../../services/whatsapp.service');
const { CouponValidationError, roundMoney, calculateDeliveryFee, findApplicableCoupon, reserveCouponUsage, releaseCouponUsage } = require('../../../services/coupon.service');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns } = require('./orders.schema');
const { ensureCustomerAccountSchema } = require('../customers/customer-account.schema');
const { calculatePaymentUpdate } = require('../../../services/payment.service');
const logger = require('../../../utils/logger');

/**
 * Get all orders with filtering and pagination
 * @route GET /api/v1/orders
 */
const getAllOrders = async (req, res) => {
  try {
    const db = await getDatabaseConnection('orders');
    await ensureOrderPaymentColumns(db);

    // Build query with filtering
    let sql = `SELECT o.* FROM orders o WHERE o.is_archived = 0`;
    const args = [];

    // Filter by status
    if (req.query.status) {
      sql += ' AND o.status = ?';
      args.push(req.query.status);
    }

    // Filter by customer_id
    if (req.query.customerId) {
      sql += ' AND o.customer_id = ?';
      args.push(req.query.customerId);
    }

    // Filter by user_id
    if (req.query.userId) {
      sql += ' AND o.user_id = ?';
      args.push(req.query.userId);
    }

    // Filter by date range (from)
    if (req.query.from) {
      sql += ' AND o.created_at >= ?';
      args.push(req.query.from);
    }

    // Filter by date range (to)
    if (req.query.to) {
      sql += ' AND o.created_at <= ?';
      args.push(req.query.to);
    }

    // Add ordering
    sql += ' ORDER BY o.created_at DESC';

    // Add pagination
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (limit > 0) {
      sql += ' LIMIT ? OFFSET ?';
      args.push(limit);
      args.push(offset);
    }

    const result = await db.execute({
      sql,
      args
    });

    // Parse cart snapshot from JSON for each order
    const ordersWithParsedCart = result.rows.map(order => ({
      ...order,
      cart_snapshot: order.cart_snapshot ? JSON.parse(order.cart_snapshot) : []
    }));

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
      if (req.user.role !== 'admin') {
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
  try {
    const { cartItems, customer } = req.body || {};
    const requestedCouponCode = req.body?.couponCode;
    if (requestedCouponCode != null && typeof requestedCouponCode !== 'string') {
      throw generateValidationError('Coupon code must be text');
    }
    let couponCode = typeof requestedCouponCode === 'string' ? requestedCouponCode.trim().toUpperCase() : '';
    const customerId = req.firebaseCustomer?.uid || req.customer?.customerId;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'A verified customer sign-in is required to place this order.' });
    }

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
    let totalAmount = 0;
    await catalogDb.execute('BEGIN IMMEDIATE TRANSACTION');
    try {
      try {
        cartSnapshot = await generateCartSnapshot(cartItems, catalogDb);
      } catch (error) {
        if (/Product or variant not found/i.test(String(error.message))) {
          throw generateNotFoundError('One or more basket items are no longer available');
        }
        throw error;
      }
      subtotalAmount = roundMoney(cartSnapshot.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
      if (!Number.isFinite(subtotalAmount) || subtotalAmount <= 0) throw generateValidationError('The basket total must be greater than zero');

      if (couponCode) {
        const quote = await findApplicableCoupon(catalogDb, couponCode, subtotalAmount);
        couponCode = quote.code;
        discountAmount = quote.discountAmount;
        reservedCouponId = quote.couponId;
        await reserveCouponUsage(catalogDb, reservedCouponId);
      }

      deliveryFee = calculateDeliveryFee(subtotalAmount);
      totalAmount = roundMoney(Math.max(0, subtotalAmount - discountAmount) + deliveryFee);

      for (const item of cartItems) {
        const result = await catalogDb.execute({ sql: 'UPDATE variants SET stock_count = stock_count - ? WHERE id = ? AND product_id = ? AND stock_count >= ?', args: [item.quantity, item.variantId, item.productId, item.quantity] });
        if (!result.rowsAffected) throw generateOutOfStockError(`Insufficient stock for ${item.variantId}`);
        await catalogDb.execute({ sql: 'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (SELECT COALESCE(SUM(stock_count), 0) FROM variants WHERE product_id = ?) = 0', args: [item.productId, item.productId] });
      }
      await catalogDb.execute('COMMIT');
      reservedItems = cartItems.map((item) => ({ ...item }));
    } catch (error) {
      try { await catalogDb.execute('ROLLBACK'); } catch (rollbackError) { logger.error('Error rolling back checkout reservation:', rollbackError); }
      reservedCouponId = null;
      throw error;
    }

    // Create pending order in ordersDb
    await ordersDb.execute({
      sql: `
        INSERT INTO orders (
          id, user_id, customer_id, firebase_uid, cart_snapshot, total_amount, customer_name,
          customer_phone, customer_address, coupon_id, coupon_code, subtotal_amount,
          discount_amount, delivery_fee, payment_status, received_amount, balance_amount,
          payment_updated_at, payment_updated_by, status, is_archived, order_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, NULL, NULL, 'pending', 0, CURRENT_TIMESTAMP)
      `,
      args: [
        orderId,
        customerId,
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
        discountAmount,
        deliveryFee,
        totalAmount,
      ]
    });
    orderInserted = true;

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
      couponCode,
    });

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
        couponCode: couponCode || null,
        totalAmount
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
      try {
        await catalogDb.execute('BEGIN IMMEDIATE TRANSACTION');
        for (const item of reservedItems) {
          await catalogDb.execute({ sql: 'UPDATE variants SET stock_count = stock_count + ? WHERE id = ? AND product_id = ?', args: [item.quantity, item.variantId, item.productId] });
        }
        if (reservedCouponId) await releaseCouponUsage(catalogDb, reservedCouponId);
        await catalogDb.execute('COMMIT');
      } catch (compensationError) {
        try { await catalogDb.execute('ROLLBACK'); } catch { /* Keep the original checkout error. */ }
        logger.error(`Error restoring checkout reservations for ${orderId || 'unassigned order'}:`, compensationError);
      }
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
    const result = await ordersDb.execute({
      sql: "UPDATE orders SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0 AND LOWER(status) IN ('pending', 'new')",
      args: [adminId, id]
    });
    if (!result.rowsAffected) throw generateValidationError('Order is not pending or has already been processed');

    res.status(200).json({
      success: true,
      message: 'Order approved successfully',
      data: { orderId: id, status: 'approved', approvedBy: adminId }
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
        await releaseCouponUsage(catalogDb, couponId);
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
    const order = await db.execute({
      sql: 'SELECT status FROM orders WHERE id = ? AND is_archived = 0',
      args: [id]
    });

    if (!order.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = String(order.rows[0].status).toLowerCase();
    if (!previousStatuses.includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        message: `Order cannot move from ${currentStatus} to ${nextStatus}`
      });
    }

    const result = await db.execute({
      sql: `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_archived = 0 AND LOWER(status) IN (${previousStatuses.map(() => '?').join(', ')})`,
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

    const payment = calculatePaymentUpdate(existing.rows[0].total_amount, req.body?.paymentStatus, req.body?.dueAmount);
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
  createOrder,
  getOrderById,
  approveOrder,
  getUserOrders,
  getAllOrders,
  cancelOrder,
  updateOrderStatus,
  updateOrderPayment,
  deleteOrder
};
