const { randomUUID } = require('node:crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns, ensureOrderReceiptColumns, ensureOrderDeliveryColumns, ensureOrderCancellationColumns } = require('../orders/orders.schema');
const { ensureCustomerAccountSchema } = require('./customer-account.schema');
const logger = require('../../../utils/logger');

function requireIdentity(req, res) {
  const uid = req.firebaseCustomer?.uid;
  if (!uid) {
    res.status(401).json({ success: false, message: 'Please sign in to access your account.' });
    return null;
  }
  return req.firebaseCustomer;
}

async function getOrdersDatabase() {
  const db = await getDatabaseConnection('orders');
  await ensureCustomerAccountSchema(db);
  await ensureOrderCouponColumns(db);
  await ensureOrderPaymentColumns(db);
  await ensureOrderReceiptColumns(db);
  await ensureOrderCancellationColumns(db);
  return db;
}

async function saveIdentity(db, identity) {
  await db.execute({
    sql: `INSERT INTO customer_profiles (firebase_uid, display_name, email, phone_number)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(firebase_uid) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, customer_profiles.display_name),
        email = COALESCE(excluded.email, customer_profiles.email),
        phone_number = COALESCE(excluded.phone_number, customer_profiles.phone_number),
        updated_at = CURRENT_TIMESTAMP`,
    args: [identity.uid, identity.displayName, identity.email, identity.phoneNumber],
  });
}

function mapAddress(row) {
  return {
    id: row.address_id,
    label: row.label,
    recipientName: row.recipient_name,
    phoneNumber: row.phone_number,
    addressLine: row.address_line,
    locality: row.locality,
    landmark: row.landmark || '',
    pincode: row.pincode,
    createdAt: row.created_at,
  };
}

function parseSnapshot(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapOrder(row) {
  const snapshot = parseSnapshot(row.cart_snapshot);
  const items = snapshot.map((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.price) || 0);
    const variantLabel = [item.size, item.weight, item.piece_size].filter(Boolean).join(' · ') || item.sku || '';
    return {
      productName: String(item.name || 'Product'),
      variantLabel: String(variantLabel),
      quantity,
      unitPrice,
      lineTotal: Number((unitPrice * quantity).toFixed(2)),
    };
  });
  const subtotalAmount = Number(row.subtotal_amount ?? items.reduce((sum, item) => sum + item.lineTotal, 0)) || 0;
  return {
    id: row.id,
    receiptNumber: row.receipt_number || null,
    receiptIssuedAt: row.receipt_issued_at || null,
    status: String(row.status || 'pending'),
    cancellationStatus: String(row.cancellation_status || 'none'),
    cancellationRequestedAt: row.cancellation_requested_at || null,
    cancellationReviewNote: row.cancellation_review_note || null,
    createdAt: row.created_at,
    customerName: row.customer_name,
    phoneNumber: row.customer_phone,
    address: row.customer_address,
    subtotalAmount,
    discountAmount: Number(row.discount_amount) || 0,
    deliveryFee: Number(row.delivery_fee) || 0,
    deliveryDistanceKm: Number(row.delivery_distance_km) || 0,
    deliveryRatePerKm: Number(row.delivery_rate_per_km) || 10,
    couponCode: row.coupon_code || null,
    totalAmount: Number(row.total_amount) || 0,
    paymentStatus: String(row.payment_status || 'unpaid'),
    paymentMethod: row.payment_method || null,
    receivedAmount: Number(row.received_amount) || 0,
    balanceAmount: Number(row.balance_amount) || 0,
    items,
  };
}

async function getMyProfile(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    await ensureOrderDeliveryColumns(db);
    await saveIdentity(db, identity);
    const [profileResult, addressResult] = await Promise.all([
      db.execute({
        sql: `SELECT display_name, email, phone_number, created_at, updated_at
          FROM customer_profiles WHERE firebase_uid = ?`,
        args: [identity.uid],
      }),
      db.execute({
        sql: `SELECT address_id, label, recipient_name, phone_number, address_line,
          locality, landmark, pincode, created_at
          FROM customer_addresses WHERE firebase_uid = ? ORDER BY created_at DESC, address_id DESC`,
        args: [identity.uid],
      }),
    ]);
    const profile = profileResult.rows[0];
    return res.status(200).json({
      success: true,
      data: {
        profile: profile ? {
          displayName: profile.display_name,
          email: profile.email,
          phoneNumber: profile.phone_number,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        } : null,
        addresses: addressResult.rows.map(mapAddress),
      },
    });
  } catch (error) {
    logger.error('Error fetching Firebase customer profile:', error);
    return res.status(500).json({ success: false, message: 'Unable to load your profile right now.' });
  }
}

async function getMyFavorites(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    const result = await db.execute({
      sql: 'SELECT product_id FROM customer_favorites WHERE firebase_uid = ? ORDER BY created_at DESC',
      args: [identity.uid],
    });
    return res.status(200).json({ success: true, data: result.rows.map((row) => String(row.product_id)) });
  } catch (error) {
    logger.error('Error fetching customer favorites:', error);
    return res.status(500).json({ success: false, message: 'Unable to load your saved products right now.' });
  }
}

function validateActiveCartItems(value) {
  if (!Array.isArray(value) || value.length > 50) {
    const error = new Error('Your cart must contain no more than 50 product variants.');
    error.status = 400;
    throw error;
  }
  const normalized = new Map();
  for (const item of value) {
    const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
    const variantId = typeof item?.variantId === 'string' ? item.variantId.trim() : '';
    const quantity = Number(item?.quantity);
    if (!productId || productId.length > 120 || !variantId || variantId.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      const error = new Error('A cart item is invalid. Refresh your cart and try again.');
      error.status = 400;
      throw error;
    }
    const key = `${productId}:${variantId}`;
    const combinedQuantity = (normalized.get(key)?.quantity || 0) + quantity;
    if (combinedQuantity > 99) {
      const error = new Error('A cart item quantity cannot exceed 99.');
      error.status = 400;
      throw error;
    }
    normalized.set(key, { productId, variantId, quantity: combinedQuantity });
  }
  return Array.from(normalized.values());
}

async function getMyCart(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    const result = await db.execute({
      sql: 'SELECT items_json FROM customer_active_carts WHERE firebase_uid = ? LIMIT 1',
      args: [identity.uid],
    });
    const storedItems = result.rows.length ? parseSnapshot(result.rows[0].items_json) : [];
    const data = await capCartItemsToAvailableStock(storedItems);
    if (JSON.stringify(data.items) !== JSON.stringify(storedItems)) {
      if (data.items.length) {
        await db.execute({
          sql: 'UPDATE customer_active_carts SET items_json = ?, item_count = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?',
          args: [JSON.stringify(data.items), data.items.reduce((sum, item) => sum + item.quantity, 0), identity.uid],
        });
      } else {
        await db.execute({ sql: 'DELETE FROM customer_active_carts WHERE firebase_uid = ?', args: [identity.uid] });
      }
    }
    return res.status(200).json({ success: true, data: { items: data.items } });
  } catch (error) {
    logger.error('Error loading signed-in customer cart:', error);
    return res.status(500).json({ success: false, message: 'Unable to sync your cart right now.' });
  }
}

async function saveMyCart(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const validatedItems = validateActiveCartItems(req.body?.items);
    const stockLimitedItems = await capCartItemsToAvailableStock(validatedItems);
    const items = stockLimitedItems.items;
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    if (!items.length) {
      await db.execute({ sql: 'DELETE FROM customer_active_carts WHERE firebase_uid = ?', args: [identity.uid] });
      return res.status(200).json({ success: true, data: { items: [], stockAdjusted: stockLimitedItems.adjusted, itemCount: 0, updatedAt: null } });
    }
    await db.execute({
      sql: `INSERT INTO customer_active_carts (firebase_uid, items_json, item_count, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(firebase_uid) DO UPDATE SET items_json = excluded.items_json,
          item_count = excluded.item_count, updated_at = CURRENT_TIMESTAMP`,
      args: [identity.uid, JSON.stringify(items), items.reduce((sum, item) => sum + item.quantity, 0)],
    });
    const updated = await db.execute({ sql: 'SELECT updated_at FROM customer_active_carts WHERE firebase_uid = ?', args: [identity.uid] });
    return res.status(200).json({ success: true, data: { items, stockAdjusted: stockLimitedItems.adjusted, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), updatedAt: updated.rows[0]?.updated_at || null } });
  } catch (error) {
    logger.error('Error saving signed-in customer cart:', error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to sync your cart right now.' });
  }
}

async function capCartItemsToAvailableStock(items) {
  if (!items.length) return { items: [], adjusted: false };
  const catalogDb = await getDatabaseConnection('catalog');
  const cappedItems = [];
  let adjusted = false;
  for (const item of items) {
    const result = await catalogDb.execute({
      sql: `SELECT v.stock_count, v.is_available, p.is_active FROM variants v
        JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.product_id = ? LIMIT 1`,
      args: [item.variantId, item.productId],
    });
    const variant = result.rows[0];
    const stock = Math.max(0, Math.floor(Number(variant?.stock_count) || 0));
    const quantity = variant && Number(variant.is_available) === 1 && Number(variant.is_active) === 1
      ? Math.min(item.quantity, stock)
      : 0;
    if (quantity !== item.quantity) adjusted = true;
    if (quantity > 0) cappedItems.push({ ...item, quantity });
  }
  return { items: cappedItems, adjusted };
}

async function addMyFavorite(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const productId = String(req.params.productId || '').trim();
  if (!productId || productId.length > 120) {
    return res.status(400).json({ success: false, message: 'A valid product is required.' });
  }
  try {
    const db = await getOrdersDatabase();
    await db.execute({
      sql: `INSERT INTO customer_favorites (firebase_uid, product_id) VALUES (?, ?)
        ON CONFLICT(firebase_uid, product_id) DO NOTHING`,
      args: [identity.uid, productId],
    });
    return res.status(200).json({ success: true, data: { productId, saved: true } });
  } catch (error) {
    logger.error('Error saving customer favorite:', error);
    return res.status(500).json({ success: false, message: 'Unable to save this product right now.' });
  }
}

async function deleteMyFavorite(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const productId = String(req.params.productId || '').trim();
  if (!productId || productId.length > 120) {
    return res.status(400).json({ success: false, message: 'A valid product is required.' });
  }
  try {
    const db = await getOrdersDatabase();
    await db.execute({
      sql: 'DELETE FROM customer_favorites WHERE firebase_uid = ? AND product_id = ?',
      args: [identity.uid, productId],
    });
    return res.status(200).json({ success: true, data: { productId, saved: false } });
  } catch (error) {
    logger.error('Error removing customer favorite:', error);
    return res.status(500).json({ success: false, message: 'Unable to remove this saved product right now.' });
  }
}

async function syncFirebaseCustomer(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    return res.status(200).json({ success: true, data: { synced: true } });
  } catch (error) {
    logger.error('Error syncing Firebase customer profile:', error);
    return res.status(500).json({ success: false, message: 'Unable to sync your customer account right now.' });
  }
}

async function updateMyPhoneNumber(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const phoneNumber = String(req.body?.phoneNumber || '').trim().slice(0, 24);
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number with 10 to 15 digits.' });
  }
  try {
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    await db.execute({
      sql: `UPDATE customer_profiles SET phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?`,
      args: [phoneNumber, identity.uid],
    });
    return res.status(200).json({ success: true, data: { phoneNumber } });
  } catch (error) {
    logger.error('Error updating Firebase customer phone number:', error);
    return res.status(500).json({ success: false, message: 'Unable to save your phone number right now.' });
  }
}

async function getMyOrders(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    await ensureOrderDeliveryColumns(db);
    const result = await db.execute({
      sql: `SELECT id, cart_snapshot, total_amount, subtotal_amount, discount_amount,
        delivery_fee, delivery_distance_km, delivery_rate_per_km, coupon_code, payment_status, payment_method, received_amount, balance_amount,
        customer_name, customer_phone, customer_address, status, created_at,
        receipt_number, receipt_issued_at, cancellation_status,
        cancellation_requested_at, cancellation_review_note
        FROM orders WHERE firebase_uid = ? AND COALESCE(is_archived, 0) = 0
        ORDER BY created_at DESC, id DESC`,
      args: [identity.uid],
    });
    const orders = result.rows.map(mapOrder);
    return res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    logger.error('Error fetching Firebase customer orders:', error);
    return res.status(500).json({ success: false, message: 'Unable to load your orders right now.' });
  }
}

async function requestMyOrderCancellation(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const orderId = String(req.params.orderId || '').trim();
  if (!orderId || orderId.length > 100) {
    return res.status(400).json({ success: false, message: 'A valid order ID is required.' });
  }
  try {
    const db = await getOrdersDatabase();
    const existingResult = await db.execute({
      sql: `SELECT id, status, cancellation_status, customer_name, customer_phone,
        total_amount, cart_snapshot FROM orders
        WHERE id = ? AND firebase_uid = ? AND COALESCE(is_archived, 0) = 0`,
      args: [orderId, identity.uid],
    });
    const order = existingResult.rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found on this account.' });
    const status = String(order.status || '').toLowerCase();
    if (!['approved', 'confirmed', 'processing'].includes(status)) {
      return res.status(409).json({ success: false, message: 'Only approved orders that have not gone out for delivery can be cancelled.' });
    }
    if (String(order.cancellation_status || 'none').toLowerCase() === 'requested') {
      return res.status(200).json({ success: true, data: { orderId, cancellationStatus: 'requested', cancellationRequestedAt: order.cancellation_requested_at || null, message: order.cancellation_message || '' } });
    }

    const items = parseSnapshot(order.cart_snapshot);
    const itemLines = items.map((item) => {
      const variant = [item.size, item.weight].filter(Boolean).join(' / ') || item.sku || 'Standard';
      return `• ${String(item.name || 'Product').slice(0, 120)} (${String(variant).slice(0, 80)}) × ${Math.max(0, Number(item.quantity) || 0)}`;
    });
    const message = [
      '*RedVeg Order Cancellation Request*', '',
      `*Order ID:* ${order.id}`,
      `*Customer:* ${String(order.customer_name || identity.displayName || 'Customer').slice(0, 120)}`,
      `*Phone:* ${String(order.customer_phone || identity.phoneNumber || '').slice(0, 24)}`,
      '', '*Items:*', ...itemLines,
      '', `*Order total:* ₹${(Number(order.total_amount) || 0).toLocaleString('en-IN')}`,
      '', 'Please review my request to cancel this order. I understand the order will only be cancelled after RedVeg approves the request.',
    ].join('\n');
    const saved = await db.execute({
      sql: `UPDATE orders SET cancellation_status = 'requested',
        cancellation_requested_at = CURRENT_TIMESTAMP, cancellation_message = ?,
        cancellation_reviewed_at = NULL, cancellation_reviewed_by = NULL,
        cancellation_review_note = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND firebase_uid = ? AND COALESCE(is_archived, 0) = 0
          AND LOWER(status) IN ('approved', 'confirmed', 'processing')
          AND LOWER(COALESCE(cancellation_status, 'none')) IN ('none', 'declined')`,
      args: [message, orderId, identity.uid],
    });
    if (!saved.rowsAffected) {
      return res.status(409).json({ success: false, message: 'This order changed while the request was being saved. Refresh your orders and try again.' });
    }
    const savedRequest = await db.execute({
      sql: 'SELECT cancellation_requested_at FROM orders WHERE id = ? AND firebase_uid = ?',
      args: [orderId, identity.uid],
    });
    return res.status(201).json({ success: true, data: { orderId, cancellationStatus: 'requested', cancellationRequestedAt: savedRequest.rows[0]?.cancellation_requested_at || null, message } });
  } catch (error) {
    logger.error('Error requesting customer order cancellation:', error);
    return res.status(500).json({ success: false, message: 'Unable to save your cancellation request right now.' });
  }
}

async function createMyAddress(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const body = req.body || {};
  const label = String(body.label || 'Home').trim().slice(0, 40);
  const recipientName = String(body.recipientName || '').trim().slice(0, 120);
  const phoneNumber = String(body.phoneNumber || '').trim().slice(0, 24);
  const digits = phoneNumber.replace(/\D/g, '');
  const addressLine = String(body.addressLine || '').trim().slice(0, 240);
  const locality = String(body.locality || '').trim().slice(0, 120);
  const landmark = String(body.landmark || '').trim().slice(0, 160);
  const pincode = String(body.pincode || '').trim();
  if (!recipientName || digits.length < 10 || digits.length > 15 || !addressLine || !locality || !/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ success: false, message: 'Enter a name, valid phone number, address, locality, and 6-digit pincode.' });
  }

  try {
    const db = await getOrdersDatabase();
    await saveIdentity(db, identity);
    const existing = await db.execute({
      sql: `SELECT address_id, label, recipient_name, phone_number, address_line,
        locality, landmark, pincode, created_at
        FROM customer_addresses WHERE firebase_uid = ?`,
      args: [identity.uid],
    });
    const normalized = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const existingAddress = existing.rows.find((row) =>
      normalized(row.address_line) === normalized(addressLine) &&
      normalized(row.locality) === normalized(locality) &&
      String(row.pincode || '') === pincode &&
      String(row.phone_number || '').replace(/\D/g, '').slice(-10) === digits.slice(-10) &&
      normalized(row.landmark) === normalized(landmark)
    );
    if (existingAddress) {
      return res.status(200).json({ success: true, data: mapAddress(existingAddress) });
    }
    const addressId = randomUUID();
    await db.execute({
      sql: `INSERT INTO customer_addresses
        (address_id, firebase_uid, label, recipient_name, phone_number, address_line, locality, landmark, pincode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [addressId, identity.uid, label || 'Home', recipientName, phoneNumber, addressLine, locality, landmark || null, pincode],
    });
    const result = await db.execute({
      sql: `SELECT address_id, label, recipient_name, phone_number, address_line,
        locality, landmark, pincode, created_at
        FROM customer_addresses WHERE address_id = ? AND firebase_uid = ?`,
      args: [addressId, identity.uid],
    });
    return res.status(201).json({ success: true, data: mapAddress(result.rows[0]) });
  } catch (error) {
    logger.error('Error saving Firebase customer address:', error);
    return res.status(500).json({ success: false, message: 'Unable to save this address right now.' });
  }
}

async function deleteMyAddress(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const addressId = String(req.params.addressId || '').trim();
  if (!addressId || addressId.length > 80) {
    return res.status(400).json({ success: false, message: 'A valid address ID is required.' });
  }
  try {
    const db = await getOrdersDatabase();
    const result = await db.execute({
      sql: 'DELETE FROM customer_addresses WHERE address_id = ? AND firebase_uid = ?',
      args: [addressId, identity.uid],
    });
    if (!result.rowsAffected) {
      return res.status(404).json({ success: false, message: 'Saved address not found.' });
    }
    return res.status(200).json({ success: true, data: { id: addressId } });
  } catch (error) {
    logger.error('Error deleting Firebase customer address:', error);
    return res.status(500).json({ success: false, message: 'Unable to remove this address right now.' });
  }
}

module.exports = { syncFirebaseCustomer, updateMyPhoneNumber, getMyProfile, getMyOrders, getMyFavorites, getMyCart, saveMyCart, addMyFavorite, deleteMyFavorite, requestMyOrderCancellation, createMyAddress, deleteMyAddress };
