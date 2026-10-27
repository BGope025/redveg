const { getDatabaseConnection } = require('../../../config/turso');
const { generateValidationError, generateNotFoundError } = require('../../../utils/error-classes');
const { hashPassword } = require('../../../utils/password.utils');
const logger = require('../../../utils/logger');
const bcrypt = require('bcryptjs');
const { ensureImportedSalesPartiesSchema } = require('./imported-sales-parties.schema');
const { ensureImportedSalesSchema } = require('../stats/imported-sales.schema');
const { ensureCustomerInvoicePaymentsSchema } = require('./customer-invoice-payments.schema');
const { createPaymentOverrideMap, getEffectiveInvoice, summarizeImportedInvoices } = require('../../../services/imported-sales-payments.service');
const { calculatePaymentUpdate } = require('../../../services/payment.service');
const { ensureImportedCustomersSchema } = require('./imported-customers.schema');
const { randomUUID } = require('crypto');

const initializedCustomerSchemas = new WeakMap();

async function getCustomerDatabase() {
  const db = await getDatabaseConnection('customer');
  let initialization = initializedCustomerSchemas.get(db);
  if (!initialization) {
    initialization = db.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        password TEXT NOT NULL,
        phone_no TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      initializedCustomerSchemas.delete(db);
      throw error;
    });
    initializedCustomerSchemas.set(db, initialization);
  }
  await initialization;
  return db;
}

/**
 * Generate a sequential customer ID in the format: C0001, C0002, etc.
 * @returns {Promise<string>} Generated customer ID
 */
const generateCustomerId = async () => {
  try {
    const db = await getCustomerDatabase();

    // Use a transaction to prevent race conditions
    await db.execute('BEGIN IMMEDIATE TRANSACTION');

    try {
      // Get the last customer ID
      const result = await db.execute({
        sql: 'SELECT customer_id FROM customers ORDER BY customer_id DESC LIMIT 1',
        args: [],
      });

      let nextId = 'C0001'; // Default for first customer

      if (result.rows.length > 0) {
        const lastId = result.rows[0].customer_id;
        // Extract the numeric part (remove 'C' prefix)
        const lastNumber = parseInt(lastId.substring(1), 10);
        const nextNumber = lastNumber + 1;

        // Format as C followed by 4-digit number with leading zeros
        nextId = `C${nextNumber.toString().padStart(4, '0')}`;
      }

      await db.execute('COMMIT');
      return nextId;
    } catch (error) {
      // Rollback transaction on error
      await db.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Error generating customer ID:', error);
    throw error;
  }
};

/**
 * Customer registration endpoint
 * @route POST /api/v1/customers/register
 */
const registerCustomer = async (req, res) => {
  try {
    const { name, address, password, phoneNo } = req.body;

    // Validate required fields
    if (!name || !address || !password || !phoneNo) {
      throw generateValidationError('Name, address, password, and phone number are required');
    }

    // Validate password length
    if (password.length < 6) {
      throw generateValidationError('Password must be at least 6 characters');
    }

    // Validate phone number (basic validation)
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.match(phoneNo.replace(/\s/g, ''))) {
      throw generateValidationError('Please enter a valid phone number');
    }

    const db = await getCustomerDatabase();

    // Check if phone number already exists
    const phoneResult = await db.execute({
      sql: 'SELECT customer_id FROM customers WHERE phone_no = ?',
      args: [phoneNo]
    });

    if (phoneResult.rows.length > 0) {
      throw generateValidationError('Phone number already registered');
    }

    // Generate customer ID
    const customerId = await generateCustomerId();

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Insert customer
    await db.execute({
      sql: `
        INSERT INTO customers (customer_id, name, address, password, phone_no)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [customerId, name, address, hashedPassword, phoneNo]
    });

    logger.info(`Customer registered: ${customerId}`);

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: {
        customerId,
        name,
        address,
        phoneNo
      }
    });
  } catch (error) {
    if (error.type === 'validation-error') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error registering customer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Customer login endpoint
 * @route POST /api/v1/customers/login
 */
const loginCustomer = async (req, res) => {
  try {
    const { name, password } = req.body;

    // Validate input
    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name and password are required'
      });
    }

    const db = await getCustomerDatabase();

    // Find customer by name
    const customerResult = await db.execute({
      sql: 'SELECT customer_id, name, address, phone_no as phoneNo, password FROM customers WHERE name = ?',
      args: [name]
    });

    if (customerResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const customer = customerResult.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token (using the same secret as admin)
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

    const token = jwt.sign(
      {
        customerId: customer.customer_id,
        name: customer.name,
        role: 'customer'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    logger.info(`Customer ${customer.name} logged in successfully`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        customer: {
          customerId: customer.customer_id,
          name: customer.name,
          address: customer.address,
          phoneNo: customer.phoneNo
        }
      }
    });
  } catch (error) {
    logger.error('Error logging in customer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get customer profile
 * @route GET /api/v1/customers/profile
 */
const getCustomerProfile = async (req, res) => {
  try {
    // We'll get the customer ID from the JWT token (middleware will add it to req.customer)
    const { customerId } = req.customer;

    const db = await getCustomerDatabase();

    const result = await db.execute({
      sql: 'SELECT customer_id, name, address, phone_no as phoneNo, created_at FROM customers WHERE customer_id = ?',
      args: [customerId]
    });

    if (result.rows.length === 0) {
      throw generateNotFoundError('Customer not found');
    }

    const customer = result.rows[0];

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    if (error.type === 'not-found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    logger.error('Error fetching customer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const db = await getCustomerDatabase();
    await ensureImportedSalesPartiesSchema(db);
    const ordersDb = await getDatabaseConnection('orders');
    const { ensureCustomerAccountSchema } = require('./customer-account.schema');
    await ensureCustomerAccountSchema(ordersDb);
    await ensureImportedCustomersSchema(db);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const search = String(req.query.search || '').trim().slice(0, 100);
    await ensureCustomerInvoicePaymentsSchema(db);
    await ensureImportedSalesSchema(ordersDb);
    const [accountRows, reportPartyRows, firebaseRows, invoiceRowsResult, overrideRowsResult, importedRows] = await Promise.all([
      db.execute('SELECT customer_id, name, phone_no AS phoneNo, created_at FROM customers'),
      db.execute('SELECT report_party_id AS customer_id, name, created_at, first_sale_date FROM imported_sales_parties'),
      ordersDb.execute(`SELECT firebase_uid, display_name, email, phone_number, created_at
        FROM customer_profiles WHERE firebase_uid IS NOT NULL AND TRIM(firebase_uid) != ''`),
      ordersDb.execute({
        sql: `SELECT invoice_no, party_key, transaction_type, payment_status, total_amount, received_amount, balance_amount
          FROM imported_sales_invoices`,
        args: [],
      }),
      db.execute(`SELECT report_party_id, invoice_no, payment_status, received_amount, balance_amount, updated_at, updated_by
        FROM customer_invoice_payment_overrides`),
      db.execute(`SELECT imported_customer_id AS customer_id, name, phone_number AS phoneNo, address, locality, pincode, notes, created_at, updated_at
        FROM imported_customers`),
    ]);
    const directory = [
      ...accountRows.rows.map((row) => ({ ...row, recordType: 'account', first_sale_date: null })),
      ...reportPartyRows.rows.map((row) => ({ ...row, phoneNo: null, recordType: 'sales_report' })),
      ...firebaseRows.rows.map((row) => ({
        customer_id: `FIREBASE-${row.firebase_uid}`,
        name: row.display_name || row.email || 'Firebase customer',
        phoneNo: row.phone_number || null,
        created_at: row.created_at,
        first_sale_date: null,
        recordType: 'firebase',
      })),
      ...importedRows.rows.map((row) => ({ ...row, recordType: 'imported', first_sale_date: null })),
    ];
    const normalizedSearch = search.toLocaleLowerCase();
    const filtered = search ? directory.filter((row) =>
      [row.name, row.customer_id, row.phoneNo].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch))
    ) : directory;
    filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) ||
      String(a.customer_id || '').localeCompare(String(b.customer_id || '')));
    const pageRows = filtered.slice(offset, offset + limit);
    const summaries = summarizeImportedInvoices(invoiceRowsResult.rows, createPaymentOverrideMap(overrideRowsResult.rows));
    const toSalesSummary = (row = {}) => ({
      invoiceCount: Number(row.invoiceCount) || 0,
      paidInvoiceCount: Number(row.paidInvoiceCount) || 0,
      partialInvoiceCount: Number(row.partialInvoiceCount) || 0,
      unpaidInvoiceCount: Number(row.unpaidInvoiceCount) || 0,
      clearedAmount: Number((Number(row.clearedAmount) || 0).toFixed(2)),
      dueAmount: Number((Number(row.dueAmount) || 0).toFixed(2)),
      cancelledInvoiceCount: Number(row.cancelledInvoiceCount) || 0,
    });
    const salesReportSummary = toSalesSummary(summaries.overall);
    const data = pageRows.map((row) => ({
      ...row,
      salesReport: row.recordType === 'sales_report' ? toSalesSummary(summaries.byParty.get(String(row.customer_id))) : null,
    }));
    res.status(200).json({ success: true, count: filtered.length, salesReportSummary, data });
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

function normalizeCustomerPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

function cleanImportedCustomer(row = {}) {
  const name = String(row.name || row.customerName || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  const phone = String(row.phone || row.phoneNo || row.mobile || row.mobileNumber || row.phone_number || '').trim().slice(0, 30);
  const normalizedPhone = normalizeCustomerPhone(phone);
  const address = String(row.address || row.addressLine || '').trim().slice(0, 500);
  const locality = String(row.locality || row.area || '').trim().slice(0, 160);
  const pincode = String(row.pincode || row.pinCode || row.postalCode || '').replace(/\D/g, '').slice(0, 10);
  const notes = String(row.notes || row.note || '').trim().slice(0, 500);
  return { name, phone, normalizedPhone, address, locality, pincode, notes };
}

const importCustomers = async (req, res) => {
  try {
    const rows = req.body?.customers;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: 'Upload a spreadsheet with customer rows.' });
    if (rows.length > 1000) return res.status(413).json({ success: false, message: 'Import up to 1,000 rows per upload.' });

    const customerDb = await getCustomerDatabase();
    const ordersDb = await getDatabaseConnection('orders');
    const { ensureCustomerAccountSchema } = require('./customer-account.schema');
    await Promise.all([ensureImportedCustomersSchema(customerDb), ensureCustomerAccountSchema(ordersDb)]);
    const [accountRows, firebaseRows, importedRows] = await Promise.all([
      customerDb.execute({ sql: 'SELECT phone_no FROM customers', args: [] }),
      ordersDb.execute({ sql: 'SELECT phone_number FROM customer_profiles WHERE phone_number IS NOT NULL', args: [] }),
      customerDb.execute({ sql: 'SELECT normalized_phone FROM imported_customers', args: [] }),
    ]);
    const existingPhones = new Set([
      ...accountRows.rows.map((row) => normalizeCustomerPhone(row.phone_no)),
      ...firebaseRows.rows.map((row) => normalizeCustomerPhone(row.phone_number)),
      ...importedRows.rows.map((row) => String(row.normalized_phone || '')),
    ].filter(Boolean));
    const batchPhones = new Set();
    const errors = [];
    const duplicates = [];
    const inserted = [];
    const pending = [];
    for (let index = 0; index < rows.length; index += 1) {
      const customer = cleanImportedCustomer(rows[index]);
      const rowNumber = Number(rows[index]?.rowNumber) || index + 2;
      if (!customer.name || !customer.normalizedPhone) {
        errors.push({ row: rowNumber, reason: !customer.name ? 'Customer name is required' : 'A valid 10-digit phone number is required' });
        continue;
      }
      if (existingPhones.has(customer.normalizedPhone) || batchPhones.has(customer.normalizedPhone)) {
        duplicates.push(rowNumber);
        continue;
      }
      batchPhones.add(customer.normalizedPhone);
      const id = `IMP-${randomUUID()}`;
      pending.push({ id, rowNumber, customer });
    }
    for (let index = 0; index < pending.length; index += 25) {
      const batch = pending.slice(index, index + 25);
      const results = await Promise.all(batch.map(({ id, customer }) => customerDb.execute({
        sql: `INSERT OR IGNORE INTO imported_customers
          (imported_customer_id, name, phone_number, normalized_phone, address, locality, pincode, notes, dedupe_key, source_file)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, customer.name, customer.phone, customer.normalizedPhone, customer.address || null, customer.locality || null,
          customer.pincode || null, customer.notes || null, `phone:${customer.normalizedPhone}`, String(req.body?.fileName || '').slice(0, 180) || null],
      })));
      results.forEach((result, resultIndex) => {
        const candidate = batch[resultIndex];
        if (Number(result.rowsAffected) > 0) {
          inserted.push({ row: candidate.rowNumber, customerId: candidate.id });
          existingPhones.add(candidate.customer.normalizedPhone);
        } else {
          duplicates.push(candidate.rowNumber);
        }
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Customer sheet processed. Existing records were left unchanged.',
      data: { inserted: inserted.length, skippedDuplicates: duplicates.length, rejected: errors.length, insertedRows: inserted, duplicateRows: duplicates, errors },
    });
  } catch (error) {
    logger.error('Error importing customers:', error);
    return res.status(500).json({ success: false, message: 'Customer import failed. No existing customer records were changed.' });
  }
};

const updateImportedCustomer = async (req, res) => {
  try {
    const customerId = String(req.params.customerId || '').trim();
    const customer = cleanImportedCustomer(req.body || {});
    if (!customer.name || !customer.normalizedPhone) return res.status(400).json({ success: false, message: 'A name and valid 10-digit phone number are required.' });
    const db = await getCustomerDatabase();
    await ensureImportedCustomersSchema(db);
    const ordersDb = await getDatabaseConnection('orders');
    const { ensureCustomerAccountSchema } = require('./customer-account.schema');
    await ensureCustomerAccountSchema(ordersDb);
    const existing = await db.execute({ sql: 'SELECT imported_customer_id FROM imported_customers WHERE imported_customer_id = ?', args: [customerId] });
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Imported customer not found.' });
    const [accounts, firebase, imported] = await Promise.all([
      db.execute({ sql: 'SELECT phone_no FROM customers', args: [] }),
      ordersDb.execute({ sql: 'SELECT phone_number FROM customer_profiles WHERE phone_number IS NOT NULL', args: [] }),
      db.execute({ sql: 'SELECT imported_customer_id, normalized_phone FROM imported_customers WHERE imported_customer_id != ?', args: [customerId] }),
    ]);
    const phoneExists = [...accounts.rows.map((row) => row.phone_no), ...firebase.rows.map((row) => row.phone_number), ...imported.rows.map((row) => row.normalized_phone)]
      .some((phone) => normalizeCustomerPhone(phone) === customer.normalizedPhone);
    if (phoneExists) return res.status(409).json({ success: false, message: 'This phone number belongs to another customer record.' });
    await db.execute({
      sql: `UPDATE imported_customers SET name = ?, phone_number = ?, normalized_phone = ?, address = ?, locality = ?, pincode = ?, notes = ?, dedupe_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE imported_customer_id = ?`,
      args: [customer.name, customer.phone, customer.normalizedPhone, customer.address || null, customer.locality || null, customer.pincode || null,
        customer.notes || null, `phone:${customer.normalizedPhone}`, customerId],
    });
    const updated = await db.execute({
      sql: `SELECT imported_customer_id AS customer_id, name, phone_number AS phoneNo, address, locality, pincode, notes, created_at, updated_at
        FROM imported_customers WHERE imported_customer_id = ?`,
      args: [customerId],
    });
    return res.status(200).json({ success: true, data: { ...updated.rows[0], recordType: 'imported' } });
  } catch (error) {
    logger.error('Error updating imported customer:', error);
    return res.status(500).json({ success: false, message: 'Could not update imported customer.' });
  }
};

function serializeImportedInvoice(row, overrides = new Map()) {
  const effective = getEffectiveInvoice(row, overrides);
  const transactionType = String(row.transaction_type || '').trim().toLowerCase();
  const paymentStatus = String(effective.effective_payment_status || '').trim();
  return {
    invoiceNo: row.invoice_no,
    orderNo: row.order_no || null,
    saleDate: row.sale_date,
    totalAmount: Number((Number(row.total_amount) || 0).toFixed(2)),
    paymentStatus,
    receivedAmount: Number((Number(effective.effective_received_amount) || 0).toFixed(2)),
    dueAmount: Number((Number(effective.effective_balance_amount) || 0).toFixed(2)),
    sourcePaymentStatus: String(row.payment_status || '').trim(),
    sourceReceivedAmount: Number((Number(row.received_amount) || 0).toFixed(2)),
    sourceDueAmount: Number((Number(row.balance_amount) || 0).toFixed(2)),
    isOverridden: effective.is_overridden,
    paymentUpdatedAt: effective.payment_updated_at,
    lineItemCount: Number(row.line_item_count) || 0,
    isEditable: transactionType === 'sale' && paymentStatus.toLowerCase() !== 'cancelled',
  };
}

const getCustomerSalesInvoices = async (req, res) => {
  try {
    const customerId = String(req.params.customerId || '').trim();
    const customerDb = await getCustomerDatabase();
    await ensureImportedSalesPartiesSchema(customerDb);
    await ensureCustomerInvoicePaymentsSchema(customerDb);
    const party = await customerDb.execute({
      sql: 'SELECT report_party_id FROM imported_sales_parties WHERE report_party_id = ?',
      args: [customerId],
    });
    if (!party.rows.length) return res.status(404).json({ success: false, message: 'Sales-report customer not found' });

    const ordersDb = await getDatabaseConnection('orders');
    await ensureImportedSalesSchema(ordersDb);
    const result = await ordersDb.execute({
      sql: `SELECT invoice_no, order_no, sale_date, party_key, total_amount, payment_status,
        received_amount, balance_amount, transaction_type, line_item_count
        FROM imported_sales_invoices WHERE party_key = ? ORDER BY sale_date DESC, invoice_no DESC`,
      args: [party.rows[0].report_party_id],
    });
    const overridesResult = await customerDb.execute({
      sql: `SELECT report_party_id, invoice_no, payment_status, received_amount, balance_amount, updated_at, updated_by
        FROM customer_invoice_payment_overrides WHERE report_party_id = ?`,
      args: [party.rows[0].report_party_id],
    });
    const overrides = createPaymentOverrideMap(overridesResult.rows);
    return res.status(200).json({ success: true, count: result.rows.length, data: result.rows.map((row) => serializeImportedInvoice(row, overrides)) });
  } catch (error) {
    logger.error('Error fetching customer sales-report invoices:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateCustomerSalesInvoicePayment = async (req, res) => {
  try {
    const customerId = String(req.params.customerId || '').trim();
    const invoiceNo = typeof req.body?.invoiceNo === 'string' ? req.body.invoiceNo.trim().slice(0, 200) : '';
    if (!invoiceNo) return res.status(400).json({ success: false, message: 'Invoice number is required' });

    const customerDb = await getCustomerDatabase();
    await ensureImportedSalesPartiesSchema(customerDb);
    await ensureCustomerInvoicePaymentsSchema(customerDb);
    const party = await customerDb.execute({
      sql: 'SELECT report_party_id FROM imported_sales_parties WHERE report_party_id = ?',
      args: [customerId],
    });
    if (!party.rows.length) return res.status(404).json({ success: false, message: 'Sales-report customer not found' });

    const reportPartyId = String(party.rows[0].report_party_id);
    const ordersDb = await getDatabaseConnection('orders');
    await ensureImportedSalesSchema(ordersDb);
    const existing = await ordersDb.execute({
      sql: `SELECT invoice_no, party_key, transaction_type, payment_status, total_amount
        FROM imported_sales_invoices WHERE invoice_no = ? AND party_key = ?`,
      args: [invoiceNo, reportPartyId],
    });
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Invoice not found for this customer' });
    const invoice = existing.rows[0];
    if (String(invoice.transaction_type || '').trim().toLowerCase() !== 'sale' || String(invoice.payment_status || '').trim().toLowerCase() === 'cancelled') {
      return res.status(409).json({ success: false, message: 'Cancelled or non-sale invoices cannot be edited' });
    }

    if (req.body?.reset === true) {
      await customerDb.execute({
        sql: 'DELETE FROM customer_invoice_payment_overrides WHERE report_party_id = ? AND invoice_no = ?',
        args: [reportPartyId, invoiceNo],
      });
    } else {
      const payment = calculatePaymentUpdate(invoice.total_amount, req.body?.paymentStatus, req.body?.dueAmount);
      await customerDb.execute({
        sql: `INSERT INTO customer_invoice_payment_overrides
          (report_party_id, invoice_no, payment_status, received_amount, balance_amount, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(report_party_id, invoice_no) DO UPDATE SET
            payment_status = excluded.payment_status,
            received_amount = excluded.received_amount,
            balance_amount = excluded.balance_amount,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = excluded.updated_by`,
        args: [reportPartyId, invoiceNo, payment.paymentStatus, payment.receivedAmount, payment.dueAmount, req.user?.userId || null],
      });
    }

    const [updated, overridesResult] = await Promise.all([
      ordersDb.execute({
        sql: `SELECT invoice_no, order_no, sale_date, party_key, total_amount, payment_status,
          received_amount, balance_amount, transaction_type, line_item_count
          FROM imported_sales_invoices WHERE invoice_no = ? AND party_key = ?`,
        args: [invoiceNo, reportPartyId],
      }),
      customerDb.execute({
        sql: `SELECT report_party_id, invoice_no, payment_status, received_amount, balance_amount, updated_at, updated_by
          FROM customer_invoice_payment_overrides WHERE report_party_id = ? AND invoice_no = ?`,
        args: [reportPartyId, invoiceNo],
      }),
    ]);
    const overrides = createPaymentOverrideMap(overridesResult.rows);
    return res.status(200).json({ success: true, data: serializeImportedInvoice(updated.rows[0], overrides) });
  } catch (error) {
    if (error.type === 'validation-error') return res.status(400).json({ success: false, message: error.message });
    logger.error('Error updating customer sales-report payment:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  getAllCustomers,
  getCustomerSalesInvoices,
  updateCustomerSalesInvoicePayment,
  importCustomers,
  updateImportedCustomer,
  generateCustomerId
};
