const { randomUUID } = require('node:crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns } = require('../orders/orders.schema');
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
    const variantLabel = [item.size, item.weight].filter(Boolean).join(' · ') || item.sku || '';
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
    receiptNumber: row.id,
    status: String(row.status || 'pending'),
    createdAt: row.created_at,
    customerName: row.customer_name,
    phoneNumber: row.customer_phone,
    address: row.customer_address,
    subtotalAmount,
    discountAmount: Number(row.discount_amount) || 0,
    deliveryFee: Number(row.delivery_fee) || 0,
    couponCode: row.coupon_code || null,
    totalAmount: Number(row.total_amount) || 0,
    paymentStatus: String(row.payment_status || 'unpaid'),
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

async function getMyOrders(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  try {
    const db = await getOrdersDatabase();
    const result = await db.execute({
      sql: `SELECT id, cart_snapshot, total_amount, subtotal_amount, discount_amount,
        delivery_fee, coupon_code, payment_status, received_amount, balance_amount,
        customer_name, customer_phone, customer_address, status, created_at
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

module.exports = { getMyProfile, getMyOrders, createMyAddress, deleteMyAddress };
