const test = require('node:test');
const assert = require('node:assert/strict');

const turso = require('../server/config/turso');
let currentDb;
turso.getDatabaseConnection = async () => currentDb;

const customerAccountController = require('../server/api/v1/customers/customer-account.controller');
const { authenticateFirebaseCustomer } = require('../server/middleware/firebase-customer-auth.middleware');
const ordersRouter = require('../server/api/v1/orders/orders.routes');

const orderColumns = [
  'id', 'user_id', 'customer_id', 'firebase_uid', 'cart_snapshot', 'total_amount',
  'subtotal_amount', 'discount_amount', 'delivery_fee', 'coupon_code', 'payment_status',
  'received_amount', 'balance_amount', 'payment_updated_at', 'payment_updated_by',
  'customer_name', 'customer_phone', 'customer_address', 'status', 'is_archived', 'created_at',
];

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function fakeOrdersDb(onExecute) {
  const statements = [];
  return {
    statements,
    db: {
      execute: async (statement) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        const args = typeof statement === 'string' ? [] : statement.args;
        statements.push({ sql, args });
        if (sql === 'PRAGMA table_info(orders)') {
          return { rows: orderColumns.map((name) => ({ name })), rowsAffected: 0 };
        }
        return (await onExecute?.(sql, args)) || { rows: [], rowsAffected: 1 };
      },
    },
  };
}

test('customer order history is filtered only by verified Firebase UID', async () => {
  const orderRow = {
    id: 'RV-ACCOUNT-A',
    cart_snapshot: JSON.stringify([{ name: 'Rohu', size: 'Standard', weight: '1 kg', price: 100, quantity: 2 }]),
    total_amount: 249,
    subtotal_amount: 200,
    discount_amount: 0,
    delivery_fee: 49,
    coupon_code: null,
    payment_status: 'unpaid',
    received_amount: 0,
    balance_amount: 249,
    customer_name: 'Verified Customer A',
    customer_phone: '9000000001',
    customer_address: 'Address A',
    status: 'pending',
    created_at: '2026-10-01 10:00:00',
  };
  const store = fakeOrdersDb((sql) => sql.includes('FROM orders WHERE firebase_uid')
    ? { rows: [orderRow], rowsAffected: 1 }
    : undefined);
  currentDb = store.db;

  const res = response();
  await customerAccountController.getMyOrders({
    firebaseCustomer: { uid: 'verified-uid-a' },
    query: { customerId: 'attacker-selected-uid' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0].id, 'RV-ACCOUNT-A');
  assert.equal(res.body.data[0].items[0].productName, 'Rohu');
  const query = store.statements.find((statement) => statement.sql.includes('FROM orders WHERE firebase_uid'));
  assert.match(query.sql, /firebase_uid = \?/);
  assert.deepEqual(query.args, ['verified-uid-a']);
  assert.ok(!query.args.includes('attacker-selected-uid'));
});

test('saved-address deletion includes both address ID and verified owner UID', async () => {
  const store = fakeOrdersDb((sql) => sql.startsWith('DELETE FROM customer_addresses')
    ? { rows: [], rowsAffected: 0 }
    : undefined);
  currentDb = store.db;

  const res = response();
  await customerAccountController.deleteMyAddress({
    firebaseCustomer: { uid: 'verified-uid-a' },
    params: { addressId: 'address-owned-by-b' },
  }, res);

  assert.equal(res.statusCode, 404);
  const deletion = store.statements.find((statement) => statement.sql.startsWith('DELETE FROM customer_addresses'));
  assert.match(deletion.sql, /address_id = \? AND firebase_uid = \?/);
  assert.deepEqual(deletion.args, ['address-owned-by-b', 'verified-uid-a']);
});

test('profile upsert and profile reads are keyed to the verified Firebase UID', async () => {
  const store = fakeOrdersDb((sql) => {
    if (sql.includes('SELECT display_name, email')) {
      return { rows: [{ display_name: 'Customer A', email: 'a@example.test', phone_number: null, created_at: '2026-10-01', updated_at: '2026-10-01' }] };
    }
    if (sql.includes('SELECT address_id, label')) return { rows: [] };
    return undefined;
  });
  currentDb = store.db;

  const res = response();
  await customerAccountController.getMyProfile({
    firebaseCustomer: { uid: 'verified-uid-a', displayName: 'Customer A', email: 'a@example.test', phoneNumber: null },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.profile.email, 'a@example.test');
  const upsert = store.statements.find((statement) => statement.sql.includes('INSERT INTO customer_profiles'));
  assert.deepEqual(upsert.args, ['verified-uid-a', 'Customer A', 'a@example.test', null]);
  const profileRead = store.statements.find((statement) => statement.sql.includes('SELECT display_name, email'));
  assert.deepEqual(profileRead.args, ['verified-uid-a']);
});

test('checkout route requires Firebase customer authentication middleware', () => {
  const checkout = ordersRouter.stack.find((layer) => layer.route?.path === '/checkout')?.route;
  assert.ok(checkout);
  assert.equal(checkout.methods.post, true);
  assert.ok(checkout.stack.some((layer) => layer.name === 'authenticateFirebaseCustomer'));
});

test('customer endpoints reject requests without a Firebase bearer token', () => {
  const res = response();
  let nextCalled = false;
  authenticateFirebaseCustomer({ headers: {} }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(nextCalled, false);
});
