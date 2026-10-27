const crypto = require('node:crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { generateCartSnapshot } = require('../../../utils/id-generator');
const { hashPassword } = require('../../../utils/password.utils');
const { ensureCustomerAccountSchema } = require('../customers/customer-account.schema');
const { ensureImportedCustomersSchema } = require('../customers/imported-customers.schema');
const { ensureImportedSalesPartiesSchema } = require('../customers/imported-sales-parties.schema');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns, ensureOrderDeliveryColumns, ensureOrderDeliverySlotColumns, ensureManualOrderColumns } = require('./orders.schema');
const { quoteDeliveryFee } = require('../../../services/delivery-fee.service');
const { CouponValidationError, roundMoney, findApplicableCoupon, reserveCouponUsage } = require('../../../services/coupon.service');
const logger = require('../../../utils/logger');

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

function phoneSearchClause(field) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${field}, ''), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', '')`;
}

function phoneSearchTerm(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

async function searchManualCustomers(req, res) {
  const query = String(req.query.q || '').trim().slice(0, 100);
  if (query.length < 2) return res.status(200).json({ success: true, data: [] });
  try {
    const ordersDb = await getDatabaseConnection('orders');
    const customerDb = await getDatabaseConnection('customer');
    await Promise.all([ensureCustomerAccountSchema(ordersDb), ensureImportedCustomersSchema(customerDb), ensureImportedSalesPartiesSchema(customerDb)]);
    const like = `%${query}%`;
    const phoneTerm = phoneSearchTerm(query);
    const profilesSql = phoneTerm
      ? `SELECT firebase_uid AS id, display_name AS name, phone_number AS phone, email
        FROM customer_profiles WHERE lower(COALESCE(display_name, '')) LIKE lower(?)
          OR lower(COALESCE(email, '')) LIKE lower(?) OR ${phoneSearchClause('phone_number')} LIKE ? LIMIT 20`
      : `SELECT firebase_uid AS id, display_name AS name, phone_number AS phone, email
        FROM customer_profiles WHERE lower(COALESCE(display_name, '')) LIKE lower(?)
          OR lower(COALESCE(email, '')) LIKE lower(?) LIMIT 20`;
    const accountsSql = phoneTerm
      ? `SELECT customer_id AS id, name, phone_no AS phone, address
        FROM customers WHERE lower(COALESCE(name, '')) LIKE lower(?) OR ${phoneSearchClause('phone_no')} LIKE ? LIMIT 20`
      : `SELECT customer_id AS id, name, phone_no AS phone, address
        FROM customers WHERE lower(COALESCE(name, '')) LIKE lower(?) LIMIT 20`;
    const importedSql = phoneTerm
      ? `SELECT imported_customer_id AS id, name, phone_number AS phone, address, locality, pincode
        FROM imported_customers WHERE lower(COALESCE(name, '')) LIKE lower(?) OR ${phoneSearchClause('phone_number')} LIKE ? LIMIT 20`
      : `SELECT imported_customer_id AS id, name, phone_number AS phone, address, locality, pincode
        FROM imported_customers WHERE lower(COALESCE(name, '')) LIKE lower(?) LIMIT 20`;
    const [profiles, accounts, imported, salesReports] = await Promise.all([
      ordersDb.execute({ sql: profilesSql, args: phoneTerm ? [like, like, `%${phoneTerm}%`] : [like, like] }),
      customerDb.execute({ sql: accountsSql, args: phoneTerm ? [like, `%${phoneTerm}%`] : [like] }),
      customerDb.execute({ sql: importedSql, args: phoneTerm ? [like, `%${phoneTerm}%`] : [like] }),
      customerDb.execute({ sql: `SELECT report_party_id AS id, name FROM imported_sales_parties WHERE lower(COALESCE(name, '')) LIKE lower(?) LIMIT 20`, args: [like] }),
    ]);
    const byPhone = new Map();
    const searchRows = [
      ...profiles.rows.map(row => ({ ...row, source: 'firebase' })),
      ...accounts.rows.map(row => ({ ...row, source: 'account' })),
      ...imported.rows.map(row => ({ ...row, source: 'imported' })),
      ...salesReports.rows.map(row => ({ ...row, source: 'sales_report' })),
    ];
    for (const row of searchRows) {
      const phoneDigits = normalizePhone(row.phone);
      if (!row.name) continue;
      const key = phoneDigits || `${row.source}:${row.id}`;
      if (!byPhone.has(key) || (phoneDigits && row.source === 'firebase')) byPhone.set(key, { id: String(row.id), source: row.source, name: String(row.name), phone: String(row.phone || ''), address: String(row.address || ''), locality: String(row.locality || ''), pincode: String(row.pincode || '') });
    }
    return res.status(200).json({ success: true, data: [...byPhone.values()].slice(0, 20) });
  } catch (error) {
    logger.error('Manual order customer search failed:', error);
    return res.status(500).json({ success: false, message: 'Could not search the customer directory.' });
  }
}

async function resolveManualCustomer(input, ordersDb, customerDb) {
  const source = String(input?.source || 'new');
  const id = String(input?.id || '').trim();
  if (source === 'firebase' && id) {
    const result = await ordersDb.execute({ sql: 'SELECT firebase_uid AS id, display_name AS name, phone_number AS phone FROM customer_profiles WHERE firebase_uid = ? LIMIT 1', args: [id] });
    if (result.rows.length) return { ...result.rows[0], source };
  }
  if (source === 'account' && id) {
    const result = await customerDb.execute({ sql: 'SELECT customer_id AS id, name, phone_no AS phone FROM customers WHERE customer_id = ? LIMIT 1', args: [id] });
    if (result.rows.length) return { ...result.rows[0], source };
  }
  if (source === 'imported' && id) {
    const result = await customerDb.execute({ sql: 'SELECT imported_customer_id AS id, name, phone_number AS phone FROM imported_customers WHERE imported_customer_id = ? LIMIT 1', args: [id] });
    if (result.rows.length) return { ...result.rows[0], source };
  }
  if (source === 'sales_report' && id) {
    const result = await customerDb.execute({ sql: 'SELECT report_party_id AS id, name FROM imported_sales_parties WHERE report_party_id = ? LIMIT 1', args: [id] });
    if (result.rows.length) return { ...result.rows[0], phone: '', source };
  }
  if (source !== 'new') throw Object.assign(new Error('The selected customer is no longer in the directory. Search and choose again.'), { statusCode: 409 });
  return { source: 'new', name: String(input?.name || '').trim(), phone: String(input?.phone || '').trim() };
}

async function resolveOrderUser(customer, ordersDb) {
  if (customer.source === 'firebase') {
    const uid = String(customer.id);
    const uidHash = crypto.createHash('sha256').update(uid).digest('hex');
    await ordersDb.execute({
      sql: `INSERT INTO users (id, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'customer') ON CONFLICT(id) DO NOTHING`,
      args: [uid, `firebase_${uidHash}`, `firebase-${uidHash}@redveg.invalid`, `firebase:${uidHash}`, `firebase_auth_managed:${crypto.randomUUID()}`],
    });
    return { userId: uid, firebaseUid: uid, customerId: null, created: true };
  }
  const normalized = normalizePhone(customer.phone);
  const currentUsers = await ordersDb.execute("SELECT id, phone FROM users WHERE LOWER(TRIM(role)) = 'customer'");
  const match = currentUsers.rows.find(row => normalizePhone(row.phone) === normalized);
  if (match) return { userId: String(match.id), firebaseUid: null, customerId: customer.source === 'account' || customer.source === 'imported' ? String(customer.id) : null, created: false };

  const suffix = crypto.createHash('sha256').update(normalized).digest('hex');
  const userId = `MANUAL-${suffix.slice(0, 32)}`;
  const initialPassword = `manual-order-only-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(initialPassword);
  await ordersDb.execute({
    sql: `INSERT INTO users (id, username, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'customer') ON CONFLICT(id) DO NOTHING`,
    args: [userId, `manual_${suffix.slice(0, 20)}`, `manual-${suffix}@redveg.invalid`, normalized, passwordHash],
  });
  return { userId, firebaseUid: null, customerId: customer.source === 'account' || customer.source === 'imported' ? String(customer.id) : null, created: true };
}

async function createManualOrder(req, res) {
  let catalogTransaction;
  let orderId;
  let couponId;
  let couponReserved = false;
  let itemsReserved = false;
  let orderInserted = false;
  let newImportedCustomerId = null;
  let newOrdersUserId = null;
  let catalogDb;
  let ordersDb;
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > 100) return res.status(400).json({ success: false, message: 'Add at least one product (up to 100 lines).' });
    for (const item of items) {
      if (typeof item.productId !== 'string' || typeof item.variantId !== 'string' || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 99) {
        return res.status(400).json({ success: false, message: 'Each line needs an available product variant and a quantity from 1 to 99.' });
      }
    }
    const customerDb = await getDatabaseConnection('customer');
    ordersDb = await getDatabaseConnection('orders');
    catalogDb = await getDatabaseConnection('catalog');
    await Promise.all([ensureCustomerAccountSchema(ordersDb), ensureImportedCustomersSchema(customerDb), ensureImportedSalesPartiesSchema(customerDb), ensureOrderCouponColumns(ordersDb), ensureOrderPaymentColumns(ordersDb), ensureOrderDeliveryColumns(ordersDb), ensureOrderDeliverySlotColumns(ordersDb), ensureManualOrderColumns(ordersDb)]);

    const customer = await resolveManualCustomer(body.customer, ordersDb, customerDb);
    const name = String(customer.name || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const resolvedPhone = normalizePhone(customer.phone);
    const phone = resolvedPhone || normalizePhone(body.customer?.phone);
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Customer name and a valid 10-digit mobile number are required.' });
    const addressLine = String(body.addressLine || '').trim().slice(0, 300);
    const locality = String(body.locality || '').trim().slice(0, 160);
    const pincode = String(body.pincode || '').replace(/\D/g, '').slice(0, 6);
    const notes = String(body.notes || '').trim().slice(0, 1000);
    if (!addressLine || !locality || !/^\d{6}$/.test(pincode)) return res.status(400).json({ success: false, message: 'Enter the delivery address, locality, and six-digit pincode.' });
    const paymentMethod = String(body.paymentMethod || 'unrecorded').trim().toLowerCase();
    if (!['unrecorded', 'cash', 'upi', 'card', 'bank_transfer', 'other'].includes(paymentMethod)) return res.status(400).json({ success: false, message: 'Choose a valid payment method.' });
    const paymentStatus = String(body.paymentStatus || 'unpaid').trim().toLowerCase();
    if (!['unpaid', 'partial', 'paid'].includes(paymentStatus)) return res.status(400).json({ success: false, message: 'Choose unpaid, partial, or paid.' });
    if (paymentStatus === 'paid' && body.paymentVerified !== true) return res.status(400).json({ success: false, message: 'Mark payment as Paid only after confirming that the payment was received.' });

    const slotId = String(body.deliverySlotId || '').trim();
    let slot = null;
    if (slotId) {
      const slotResult = await catalogDb.execute({ sql: 'SELECT id, name, start_time, end_time FROM delivery_slots WHERE id = ? AND is_active = 1', args: [slotId] });
      slot = slotResult.rows[0] || null;
      if (!slot) return res.status(409).json({ success: false, message: 'That delivery slot is no longer available.' });
    }

    const deliveryDestination = { addressLine, area: locality, pincode, city: String(body.city || 'Kolkata'), state: String(body.state || 'West Bengal') };
    let deliveryQuote;
    try {
      deliveryQuote = await quoteDeliveryFee(deliveryDestination, { requireExactAddress: true });
    } catch (error) {
      if (newImportedCustomerId) {
        await customerDb.execute({ sql: 'DELETE FROM imported_customers WHERE imported_customer_id = ?', args: [newImportedCustomerId] }).catch(() => {});
        newImportedCustomerId = null;
      }
      return res.status(422).json({ success: false, message: error.message || 'A valid delivery quote is required.' });
    }
    if (customer.source === 'new' || customer.source === 'sales_report' || !resolvedPhone) {
      const [profiles, accounts, imported] = await Promise.all([
        ordersDb.execute('SELECT phone_number AS phone FROM customer_profiles WHERE phone_number IS NOT NULL'),
        customerDb.execute('SELECT phone_no AS phone FROM customers'),
        customerDb.execute('SELECT phone_number AS phone FROM imported_customers'),
      ]);
      const duplicate = [...profiles.rows, ...accounts.rows, ...imported.rows].some(row => normalizePhone(row.phone) === phone);
      if (duplicate) return res.status(409).json({ success: false, message: 'A customer with this phone number already exists. Search the directory and select that customer.' });
    }
    if (customer.source === 'new' || customer.source === 'sales_report') {
      const importedId = `IMP-${crypto.randomUUID()}`;
      await customerDb.execute({
        sql: `INSERT INTO imported_customers (imported_customer_id, name, phone_number, normalized_phone, address, locality, pincode, notes, dedupe_key, source_file)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Admin Manual Order')`,
        args: [importedId, name, phone, phone, addressLine, locality, pincode, notes || null, `phone:${phone}`],
      });
      newImportedCustomerId = importedId;
      Object.assign(customer, { id: importedId, source: 'imported', name, phone });
    }
    catalogTransaction = await catalogDb.transaction('write');
    let snapshot = await generateCartSnapshot(items.map(item => ({ ...item, quantity: Number(item.quantity) })), catalogTransaction);
    snapshot = snapshot.map((item, index) => ({ ...item, cuttingOption: String(items[index]?.cuttingOption || '').trim().slice(0, 120) || null }));
    const subtotal = roundMoney(snapshot.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0));
    deliveryQuote = await quoteDeliveryFee(deliveryDestination, { subtotalAmount: subtotal });
    const phoneKey = customer.source === 'firebase' ? `firebase:${customer.id}` : customer.source === 'account' ? `customer:${customer.id}` : `manual:${phone}`;
    const code = String(body.couponCode || '').trim().toUpperCase();
    let discountAmount = 0;
    if (code) {
      const couponCustomerId = customer.source === 'firebase' ? String(customer.id) : customer.source === 'account' ? String(customer.id) : phone;
      const quote = await findApplicableCoupon(catalogTransaction, code, subtotal, { id: couponCustomerId, key: phoneKey, ordersDb });
      couponId = quote.couponId;
      discountAmount = quote.discountAmount;
    }
    const deliveryFee = deliveryQuote.deliveryFee;
    const total = roundMoney(Math.max(0, subtotal - discountAmount) + deliveryFee);
    const amountReceived = Number(body.amountReceived || 0);
    if (!Number.isFinite(amountReceived) || amountReceived < 0 || amountReceived > total || (paymentStatus === 'partial' && !(amountReceived > 0 && amountReceived < total)) || (paymentStatus === 'unpaid' && amountReceived !== 0) || (paymentStatus === 'paid' && amountReceived !== total)) {
      throw Object.assign(new Error('Amount received must match the selected payment status.'), { statusCode: 400 });
    }
    const orderUser = await resolveOrderUser(customer, ordersDb);
    if (orderUser.created && customer.source !== 'firebase') newOrdersUserId = orderUser.userId;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      orderId = `#RV-M${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 1000)}`;
      const exists = await ordersDb.execute({ sql: 'SELECT id FROM orders WHERE id = ? LIMIT 1', args: [orderId] });
      if (!exists.rows.length) break;
      orderId = null;
    }
    if (!orderId) throw new Error('Could not generate a unique order number. Please try again.');

    if (couponId) {
      await reserveCouponUsage(catalogTransaction, couponId, phoneKey, orderId);
      couponReserved = true;
    }
    for (const item of items) {
      const reserved = await catalogTransaction.execute({ sql: 'UPDATE variants SET stock_count = stock_count - ? WHERE id = ? AND product_id = ? AND stock_count >= ? AND is_available = 1', args: [Number(item.quantity), item.variantId, item.productId, Number(item.quantity)] });
      if (!reserved.rowsAffected) throw Object.assign(new Error(`Not enough stock for ${item.variantId}. Refresh the catalog and try again.`), { statusCode: 409 });
      await catalogTransaction.execute({ sql: 'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (SELECT COALESCE(SUM(stock_count), 0) FROM variants WHERE product_id = ?) = 0', args: [item.productId, item.productId] });
    }
    await catalogTransaction.commit();
    catalogTransaction = null;
    itemsReserved = true;

    const received = paymentStatus === 'paid' ? total : roundMoney(amountReceived);
    const due = roundMoney(total - received);
    const storedAddress = [addressLine, locality, `Kolkata, West Bengal ${pincode}`].join(', ');
    await ordersDb.execute({
      sql: `INSERT INTO orders (
        id, user_id, customer_id, firebase_uid, cart_snapshot, total_amount, customer_name, customer_phone, customer_address,
        coupon_id, coupon_code, subtotal_amount, discount_amount, delivery_fee, payment_status, received_amount, balance_amount,
        delivery_distance_km, delivery_rate_per_km, delivery_origin_latitude, delivery_origin_longitude,
        delivery_destination_latitude, delivery_destination_longitude, delivery_distance_method, delivery_distance_provider,
        delivery_origin_address, delivery_matched_address, delivery_slot_id, delivery_slot_name, delivery_slot_time,
        payment_method, payment_updated_at, payment_updated_by, customer_notes, order_source, created_by,
        status, is_archived, order_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'Admin Manual', ?, 'pending', 0, CURRENT_TIMESTAMP)`,
      args: [orderId, orderUser.userId, orderUser.customerId, orderUser.firebaseUid, JSON.stringify(snapshot), total, name, phone, storedAddress,
        couponId || null, code || null, subtotal, discountAmount, deliveryFee, paymentStatus, received, due,
        deliveryQuote.distanceKm, deliveryQuote.ratePerKm, deliveryQuote.originLatitude, deliveryQuote.originLongitude,
        deliveryQuote.destinationLatitude, deliveryQuote.destinationLongitude, deliveryQuote.distanceMethod, deliveryQuote.distanceProvider,
        deliveryQuote.originAddress, deliveryQuote.matchedDestinationAddress,
        slot?.id || null, slot?.name || null, slot ? `${slot.start_time}-${slot.end_time}` : null,
        paymentMethod, paymentStatus === 'unpaid' ? null : req.user.userId, notes || null, req.user.userId],
    });
    orderInserted = true;
    return res.status(201).json({ success: true, message: 'Manual order saved to the order database.', data: { id: orderId, status: 'pending', orderSource: 'Admin Manual', subtotal, discountAmount, deliveryFee, total, paymentStatus, receivedAmount: received, dueAmount: due } });
  } catch (error) {
    if (catalogTransaction) await catalogTransaction.rollback().catch(() => {});
    if (newImportedCustomerId && !orderInserted) {
      try {
        const customerDb = await getDatabaseConnection('customer');
        await customerDb.execute({ sql: 'DELETE FROM imported_customers WHERE imported_customer_id = ?', args: [newImportedCustomerId] });
      } catch (cleanupError) {
        logger.error('Manual customer rollback failed:', cleanupError);
      }
    }
    if (newOrdersUserId && !orderInserted && ordersDb) {
      try { await ordersDb.execute({ sql: 'DELETE FROM users WHERE id = ? AND LOWER(TRIM(role)) = \'customer\'', args: [newOrdersUserId] }); }
      catch (cleanupError) { logger.error('Manual order customer-account rollback failed:', cleanupError); }
    }
    if (itemsReserved && orderId && !orderInserted) {
      let undo;
      try {
        undo = await catalogDb.transaction('write');
        for (const item of req.body?.items || []) await undo.execute({ sql: 'UPDATE variants SET stock_count = stock_count + ? WHERE id = ? AND product_id = ?', args: [Number(item.quantity), item.variantId, item.productId] });
        if (couponReserved && couponId) {
          const { releaseCouponUsage } = require('../../../services/coupon.service');
          await releaseCouponUsage(undo, couponId, orderId);
        }
        await undo.commit();
      } catch (compensationError) {
        await undo?.rollback().catch(() => {});
        logger.error('Manual order stock rollback failed:', compensationError);
      }
    }
    if (error instanceof CouponValidationError) return res.status(error.statusCode).json({ success: false, message: error.message });
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    logger.error('Manual order creation failed:', error);
    return res.status(500).json({ success: false, message: 'Could not save this manual order. No success was recorded.' });
  }
}

module.exports = { createManualOrder, searchManualCustomers };

