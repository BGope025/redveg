const test = require('node:test');
const assert = require('node:assert/strict');

const turso = require('../server/config/turso');
let currentDb;
let currentDbs = {};
const queries = [];
turso.getDatabaseConnection = async (name) => currentDbs[name] || currentDb;

const productsController = require('../server/api/v1/products/products.controller');
const statsController = require('../server/api/v1/stats/stats.controller');
const campaignsController = require('../server/api/v1/campaigns/campaigns.controller');
const deliveryController = require('../server/api/v1/admin/delivery-locations/delivery-locations.controller');
const ordersController = require('../server/api/v1/orders/orders.controller');
const ordersRouter = require('../server/api/v1/orders/orders.routes');
const customersController = require('../server/api/v1/customers/customers.controller');
const couponsController = require('../server/api/v1/coupons/coupons.controller');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../server/config/env');
const { requireCouponAdmin } = require('../server/api/v1/coupons/coupons.middleware');
const { ensureOrderCouponColumns, ensureOrderPaymentColumns } = require('../server/api/v1/orders/orders.schema');
const couponService = require('../server/services/coupon.service');
const categoriesController = require('../server/api/v1/categories/categories.controller');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function request(query = {}) { return { query, params: {}, body: {} }; }

function dbReturning(rows) {
  return { execute: async (statement) => {
    queries.push(typeof statement === 'string' ? statement : statement.sql);
    return { rows, rowsAffected: rows.length };
  } };
}

async function withDeliveryRouteMock(callback) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === 'api.geoapify.com') {
      return Response.json({ features: [{ properties: { distance: 4900 } }] });
    }
    if (url.hostname === 'router.project-osrm.org') {
      return Response.json({ code: 'Ok', routes: [{ distance: 4900 }] });
    }
    return originalFetch(input, init);
  };
  try {
    return await callback();
  } finally {
    global.fetch = originalFetch;
  }
}

test('products endpoint maps database variant size, weight, price, and stock_count', async () => {
  queries.length = 0;
  currentDb = dbReturning([{ id: 'P1', name: 'Rohu', is_active: 1, variant_id: 'V1', sku: 'SKU-1', size: 'Standard', weight: '500 g', price: 349, stock_count: 12 }]);
  const res = response();
  await productsController.getAllProducts(request({ limit: '10' }), res);
  assert.equal(res.statusCode, 200);
  const variant = res.body.data[0].variants[0];
  assert.deepEqual({ size: variant.size, weight: variant.weight, price: variant.price, stock: variant.stock, stockCount: variant.stockCount, available: variant.available }, { size: 'Standard', weight: '500 g', price: 349, stock: 12, stockCount: 12, available: true });
  assert.equal(variant.label, '500 g', 'legacy generic variant names display their actual weight');
  assert.match(queries[0], /stock_count/);
});

test('legacy Standard-prefixed variant labels use their actual stored weight', async () => {
  currentDb = dbReturning([{ id: 'P1', name: 'Desi Mutton', is_active: 1, variant_id: 'V1', sku: 'RV-MUT-DM-1KG', size: 'Standard 500kg', weight: '1 kg', price: 998, stock_count: 5 }]);
  const res = response();
  await productsController.getAllProducts(request({ category: 'mutton' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].variants[0].label, '1 kg');
});

test('products endpoint matches category slugs to display-name catalog categories', async () => {
  queries.length = 0;
  let statement;
  currentDb = { execute: async (nextStatement) => {
    statement = nextStatement;
    queries.push(nextStatement.sql);
    return { rows: [] };
  } };
  const res = response();
  await productsController.getAllProducts(request({ category: 'deshi-fish', limit: '50' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(queries[0], /REPLACE\(TRIM\(p\.category\), ' ', '-'\)/);
  assert.deepEqual(statement.args, ['deshi-fish', 'deshi-fish', 'deshi-fish', 50, 0]);
});

test('storefront product search matches each keyword across product and variant fields', async () => {
  let statement;
  currentDb = { execute: async (nextStatement) => {
    statement = nextStatement;
    return { rows: [] };
  } };
  const res = response();
  await productsController.getAllProducts(request({ q: 'fresh chicken drumsticks', limit: '10' }), res);

  assert.equal(res.statusCode, 200);
  assert.match(statement.sql, /LOWER\(COALESCE\(p\.name/);
  assert.match(statement.sql, /LOWER\(COALESCE\(p\.category/);
  assert.match(statement.sql, /LOWER\(COALESCE\(p\.description/);
  assert.match(statement.sql, /search_variant\.sku/);
  assert.match(statement.sql, /search_variant\.size/);
  assert.match(statement.sql, /search_variant\.weight/);
  assert.ok(statement.args.includes('%chicken%'));
  assert.ok(statement.args.includes('%drumstick%'));
  assert.ok(!statement.args.includes('%fresh%'), 'generic freshness wording should not block catalog matches');
  assert.deepEqual(statement.args.slice(-2), [10, 0]);
});

test('storefront product search expands fish-name spellings and seafood synonyms', async () => {
  let statement;
  currentDb = { execute: async (nextStatement) => {
    statement = nextStatement;
    return { rows: [] };
  } };
  const res = response();
  await productsController.getAllProducts(request({ q: 'hilsha shrimp' }), res);

  assert.equal(res.statusCode, 200);
  for (const keyword of ['%hilsha%', '%hilsa%', '%ilish%', '%shrimp%', '%prawn%', '%chingri%']) {
    assert.ok(statement.args.includes(keyword), `expected search to include ${keyword}`);
  }
});

test('revenue reports query created_at and return a normalized series', async () => {
  queries.length = 0;
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    queries.push(sql);
    if (sql.includes('AS lifetime_revenue')) return { rows: [{ lifetime_revenue: 24000 }] };
    if (sql.includes('FROM imported_sales_invoices') && sql.includes('AS invoice_count')) return { rows: [{ invoice_count: 0, invoiced_amount: 0, received_amount: 0, outstanding_amount: 0, cancelled_invoice_count: 0 }] };
    if (sql.includes('FROM imported_sales_invoices')) return { rows: [] };
    return { rows: [{ period: '2026-10', order_count: 3, revenue: 2100 }] };
  } };
  const res = response();
  await statsController.getRevenueStats(request({ range: 'lifetime', bucket: 'month' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.series[0].orders, 3);
  assert.equal(res.body.data.series[0].revenue, 2100);
  assert.equal(res.body.data.summary.periodRevenue, 2100);
  assert.equal(res.body.data.summary.lifetimeRevenue, 24000);
  assert.ok(res.body.data.includedStatuses.includes('delivered'));
  const orderSeriesStatement = statements.find((statement) => typeof statement !== 'string' && statement.sql.includes('FROM orders') && statement.sql.toLowerCase().includes('as period'));
  assert.ok(orderSeriesStatement);
  assert.match(orderSeriesStatement.sql, /created_at/);
  assert.doesNotMatch(orderSeriesStatement.sql, /order_date/);
  assert.match(orderSeriesStatement.sql, /LOWER\(status\) IN \('approved', 'completed', 'delivered'\)/);
  const lifetimeStatement = statements.find((statement) => typeof statement !== 'string' && statement.sql.includes('AS lifetime_revenue'));
  assert.deepEqual(lifetimeStatement.args, []);
});

test('stats endpoint passes explicit empty args to parameterless libsql statements', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    statements.push(statement);
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.includes(' as start')) return { rows: [{ start: '2026-10-05 18:30:00' }] };
    if (sql.includes(' as end')) return { rows: [{ end: '2026-10-06 18:30:00' }] };
    if (sql.includes('pending_count')) return { rows: [{ pending_count: 2 }] };
    return { rows: [{ order_count: 3, revenue: 2100 }] };
  } };

  const res = response();
  await statsController.getStats(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].value, '3');
  assert.equal(res.body[3].value, '2');
  assert.ok(statements.slice(0, 4).every((statement) => Array.isArray(statement.args)));
});

test('lifetime earnings remain all-time when the analytics chart is filtered to the last 30 days', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.includes('AS lifetime_revenue')) return { rows: [{ lifetime_revenue: 97500 }] };
    return { rows: [{ period: '2026-10', order_count: 2, revenue: 1800 }] };
  } };

  const res = response();
  await statsController.getRevenueStats(request({ range: '30d', bucket: 'day' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.summary.periodRevenue, 1800);
  assert.equal(res.body.data.summary.lifetimeRevenue, 97500);
  const lifetimeQuery = statements.find((sql) => sql.includes('AS lifetime_revenue'));
  assert.ok(lifetimeQuery);
  assert.match(lifetimeQuery, /LOWER\(status\) IN \('approved', 'completed', 'delivered'\)/);
  assert.doesNotMatch(lifetimeQuery, /created_at\s*[<>]/i);
});

test('campaigns endpoint orders using the actual createdAt column and preserves records', async () => {
  queries.length = 0;
  currentDb = dbReturning([{ id: 'C1', name: 'Weekend Combo', status: 'published', createdAt: '2026-10-01', startsAt: '2026-10-01', endsAt: '2026-10-10' }]);
  const res = response();
  await campaignsController.getCampaigns(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].id, 'C1');
  assert.match(queries[0], /createdAt DESC/);
});

test('delivery areas endpoint maps serviceability and location fields', async () => {
  currentDb = dbReturning([{ pincode: '700029', area: 'Kalighat', city: 'Kolkata', state: 'West Bengal', is_serviceable: 1, latitude: 22.52, longitude: 88.34, updated_at: '2026-10-01' }]);
  const res = response();
  await deliveryController.getAllLocations(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].isServiceable, true);
  assert.equal(res.body.data[0].pincode, '700029');
});

test('delivery area availability update validates input and writes the database field', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    statements.push(typeof statement === 'string' ? statement : statement.sql);
    if (statements.length === 1) return { rowsAffected: 1, rows: [] };
    return { rows: [{ pincode: '700029', area: 'Kalighat', city: 'Kolkata', state: 'West Bengal', is_serviceable: 0 }] };
  } };
  const res = response();
  await deliveryController.updateAvailability({ params: { pincode: '700029' }, body: { isServiceable: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.isServiceable, false);
  assert.match(statements[0], /is_serviceable/);
});

test('admin products endpoint returns joined variants with weight, price, and stock', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.includes('LEFT JOIN variants')) return { rows: [{ id: 'P3', name: 'Hilsa', is_active: 1, category: 'fish', variants_json: JSON.stringify([{ id: 'V3', product_id: 'P3', sku: 'HILSA-1KG', size: 'Standard', weight: '1 kg', price: 1599, stock_count: 8 }]) }] };
    return { rows: [] };
  } };
  const res = response();
  await productsController.getAdminProducts(request({ limit: '8', offset: '0' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].variants[0].weight, '1 kg');
  assert.equal(res.body.data[0].variants[0].stock, 8);
  assert.match(statements[0], /LEFT JOIN variants/);
  assert.match(statements[0], /json_group_array/);
});

test('order status endpoint advances an approved order to processing', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    if (sql.startsWith('SELECT status')) return { rows: [{ status: 'approved' }] };
    return { rowsAffected: 1, rows: [] };
  } };
  const res = response();
  await ordersController.updateOrderStatus({ params: { id: 'O1' }, body: { status: 'processing' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { id: 'O1', status: 'processing' });
  assert.match(statements[1].sql, /LOWER\(status\) IN \(\?, \?\)/);
  assert.deepEqual(statements[1].args, ['processing', 'O1', 'approved', 'confirmed']);
});

test('order status endpoint rejects invalid transitions without writing', async () => {
  queries.length = 0;
  currentDb = dbReturning([{ status: 'pending' }]);
  const res = response();
  await ordersController.updateOrderStatus({ params: { id: 'O1' }, body: { status: 'delivered' } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
});

test('order status endpoint rejects statuses outside the supported workflow', async () => {
  const res = response();
  await ordersController.updateOrderStatus({ params: { id: 'O1' }, body: { status: 'unknown' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});


test('customers endpoint creates an empty customer table on first access and returns a real empty state', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
    if (sql === 'PRAGMA table_info(orders)') return { rows: ['id', 'customer_id', 'firebase_uid', 'created_at'].map((name) => ({ name })) };
    if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
    return { rows: [], rowsAffected: 0 };
  } };
  const res = response();
  await customersController.getAllCustomers(request({ limit: '25', offset: '0' }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.count, 0);
  assert.ok(statements.some((statement) => statement.sql.includes('CREATE TABLE IF NOT EXISTS customers')));
  assert.ok(statements.some((statement) => statement.sql.includes('CREATE TABLE IF NOT EXISTS imported_sales_parties')));
  assert.ok(statements.some((statement) => (typeof statement === 'string' ? statement : statement.sql).includes('FROM customers')));
  assert.ok(statements.some((statement) => statement.sql.includes('FROM customer_profiles')));
  assert.ok(statements.some((statement) => statement.sql.includes('FROM imported_customers')));
});

test('catalog product and variants are created atomically and return a persistent product id', async () => {
  const statements = [];
  let committed = false;
  let rolledBack = false;
  currentDb = {
    execute: async () => ({ rows: [] }),
    transaction: async (mode) => {
      assert.equal(mode, 'write');
      return {
        execute: async (statement) => {
          statements.push(statement);
          if (statement.sql.startsWith('SELECT id, product_id, sku')) return { rows: [] };
          return { rows: [], rowsAffected: 1 };
        },
        commit: async () => { committed = true; },
        rollback: async () => { rolledBack = true; },
        close: () => {}
      };
    }
  };
  const res = response();
  await productsController.createProduct({ ...request(), body: {
    name: 'Future Cut', category: 'Chicken', description: '', image_url: 'https://images.example/cut.webp',
    variants: [{ id: 'temp-1', sku: 'FUTURE-CUT-500', variant_name: '500 g', price: 225, stock_count: 7, is_available: true }]
  } }, res);

  assert.equal(res.statusCode, 201);
  assert.match(res.body.data.id, /^PRD-[0-9a-f-]{36}$/i);
  assert.equal(committed, true);
  assert.equal(rolledBack, false);
  assert.ok(statements.some((statement) => statement.sql.includes('INSERT INTO products')));
  assert.ok(statements.some((statement) => statement.sql.includes('INSERT INTO variants')));
  assert.ok(statements.some((statement) => statement.sql.includes('INSERT INTO catalog_categories')));
});

test('admin can create a category that is persisted in the catalog database', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    statements.push(statement);
    if (typeof statement === 'object' && statement.sql.includes('SELECT category_slug, category_name FROM catalog_categories')) return { rows: [] };
    return { rows: [] };
  } };
  const res = response();
  await categoriesController.createCategory({ ...request(), body: { name: 'Duck' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.id, 'duck');
  assert.equal(res.body.data.name, 'Duck');
  assert.ok(statements.some(statement => typeof statement === 'object' && statement.sql.includes('INSERT INTO catalog_categories')));
});

test('storefront categories include newly created categories before products are assigned', async () => {
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.includes('SELECT DISTINCT TRIM(category) AS category')) return { rows: [] };
    if (sql.includes('FROM category_image_settings')) return { rows: [] };
    if (sql.includes('FROM catalog_categories')) return { rows: [{ category_slug: 'duck', category_name: 'Duck', created_at: '2026-10-11' }] };
    if (sql.includes('GROUP BY TRIM(category)')) return { rows: [] };
    return { rows: [] };
  } };
  const res = response();
  await categoriesController.getAllCategories(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.some(category => category.id === 'duck' && category.name === 'Duck' && category.productCount === 0), true);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('catalog write rejects missing price or stock before opening a database transaction', async () => {
  let openedTransaction = false;
  currentDb = { transaction: async () => { openedTransaction = true; throw new Error('should not run'); } };
  const res = response();
  await productsController.createProduct({ ...request(), body: {
    name: 'Invalid Cut', category: 'Chicken',
    variants: [{ id: 'temp-1', sku: 'INVALID-1', variant_name: '500 g', price: '', stock_count: 2 }]
  } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(openedTransaction, false);
});

test('catalog write rejects generic Standard variant labels before opening a database transaction', async () => {
  let openedTransaction = false;
  currentDb = { transaction: async () => { openedTransaction = true; throw new Error('should not run'); } };
  const res = response();
  await productsController.createProduct({ ...request(), body: {
    name: 'Invalid Cut', category: 'Chicken',
    variants: [{ id: 'temp-1', sku: 'INVALID-1', variant_name: 'Standard 500 g', weight: '500 g', price: 100, stock_count: 2 }]
  } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(openedTransaction, false);
});

test('catalog edits persist variant name, price, stock, and visibility in one transaction', async () => {
  const statements = [];
  let committed = false;
  currentDb = {
    execute: async (statement) => {
      assert.match(statement.sql, /SELECT id FROM products/);
      return { rows: [{ id: 'P1' }] };
    },
    transaction: async () => ({
      execute: async (statement) => {
        statements.push(statement);
        if (statement.sql.startsWith('SELECT id, product_id, sku')) return { rows: [{ id: 'V1', product_id: 'P1', sku: 'CUT-500' }] };
        return { rows: [], rowsAffected: 1 };
      },
      commit: async () => { committed = true; },
      rollback: async () => {},
      close: () => {}
    })
  };
  const res = response();
  await productsController.updateProduct({
    ...request(), params: { id: 'P1' }, body: {
      name: 'Updated Cut',
      variants: [{ id: 'V1', sku: 'CUT-500', variant_name: '500 g', price: 410, stock_count: 8, is_available: false }]
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(committed, true);
  assert.ok(statements.some((statement) => statement.sql.includes('UPDATE products')));
  const variantUpdate = statements.find((statement) => statement.sql.includes('UPDATE variants SET'));
  assert.ok(variantUpdate);
  assert.ok(variantUpdate.args.includes('500 g'));
  assert.ok(variantUpdate.args.includes(410));
  assert.ok(variantUpdate.args.includes(8));
  assert.ok(variantUpdate.args.includes(0));
});

test('customers endpoint searches by name, customer ID or phone and reports total matches', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    if (sql === 'PRAGMA table_info(orders)') return { rows: ['id', 'customer_id', 'firebase_uid', 'created_at'].map((name) => ({ name })) };
    if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
    if (sql.includes('SELECT customer_id')) return { rows: [{ customer_id: 'C0001', name: 'Asha Rao', phoneNo: '9876543210', created_at: '2026-10-01' }] };
    return { rows: [] };
  } };

  const res = response();
  await customersController.getAllCustomers(request({ search: 'Asha', limit: '10', offset: '0' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0].customer_id, 'C0001');
  assert.equal(res.body.data[0].name, 'Asha Rao');
  assert.equal(res.body.data[0].phoneNo, '9876543210');
  assert.ok(statements.some((statement) => (typeof statement === 'string' ? statement : statement.sql).includes('FROM customers')));
});


test('coupon admin list initializes the catalog coupon schema and returns paginated database records', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
    if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
    if (sql.includes('SELECT * FROM coupons')) return { rows: [{
      id: 'cpn-1', code: 'SAVE10', description: 'Ten percent off', discount_type: 'percentage',
      discount_value: 10, max_discount_amount: 250, min_order_amount: 500,
      starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z',
      usage_limit: 100, usage_count: 2, is_active: 1, created_at: '2026-10-01', updated_at: '2026-10-01',
    }] };
    return { rows: [], rowsAffected: 0 };
  } };
  const res = response();
  await couponsController.getCoupons(request({ limit: '10', offset: '0', search: 'save' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0].code, 'SAVE10');
  assert.equal(res.body.data[0].discountType, 'percentage');
  assert.equal(res.body.data[0].isActive, true);
  assert.ok(statements.some((s) => /CREATE TABLE IF NOT EXISTS coupons/.test(s.sql)));
  assert.ok(statements.some((s) => /idx_coupons_active_dates/.test(s.sql)));
  const selectQuery = statements.find((s) => s.sql.includes('SELECT * FROM coupons'));
  assert.ok(selectQuery);
  assert.match(selectQuery.sql, /code LIKE \?/);
  assert.deepEqual(selectQuery.args, ['%save%', '%save%', 10, 0]);
});

test('coupon creation normalizes codes and persists validated discount rules', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    if (sql.startsWith('SELECT * FROM coupons')) return { rows: [{
      id: statements.at(-1).args[0], code: 'SAVE10', description: 'Save ten', discount_type: 'percentage',
      discount_value: 10, max_discount_amount: null, min_order_amount: 500,
      starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z',
      usage_limit: 50, usage_count: 0, is_active: 1, created_at: '2026-10-03', updated_at: '2026-10-03',
    }] };
    return { rows: [], rowsAffected: 1 };
  } };

  const res = response();
  await couponsController.createCoupon({ body: {
    code: ' save10 ', description: 'Save ten', discountType: 'percentage', discountValue: 10,
    minOrderAmount: 500, startsAt: '2026-10-01', endsAt: '2026-11-01', usageLimit: 50,
  } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.code, 'SAVE10');
  const insert = statements.find((statement) => typeof statement !== 'string' && statement.sql.startsWith('INSERT INTO coupons'));
  assert.ok(insert);
  assert.equal(insert.args[1], 'SAVE10');
  assert.equal(insert.args[3], 'percentage');
  assert.equal(insert.args[4], 10);
});

test('invalid coupons are rejected before database writes', async () => {
  const res = response();
  await couponsController.createCoupon({ body: {
    code: 'TOOLONG', discountType: 'percentage', discountValue: 150,
    startsAt: '2026-11-01', endsAt: '2026-10-01',
  } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('coupon updates and deletes preserve coupons by deactivating instead of hard deleting', async () => {
  const statements = [];
  const existing = {
    id: 'cpn-2', code: 'SAVE5', description: '', discount_type: 'fixed', discount_value: 5,
    max_discount_amount: null, min_order_amount: 0, starts_at: '2026-10-01T00:00:00.000Z',
    ends_at: '2026-11-01T00:00:00.000Z', usage_limit: null, usage_count: 0,
    is_active: 1, created_at: '2026-10-01', updated_at: '2026-10-01',
  };
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    if (sql === 'SELECT * FROM coupons WHERE id = ?') return { rows: [{ ...existing, description: statements.some((item) => typeof item !== 'string' && item.sql.startsWith('UPDATE coupons SET')) ? 'Updated note' : existing.description }] };
    if (sql.startsWith('UPDATE coupons SET')) return { rowsAffected: 1, rows: [] };
    return { rows: [], rowsAffected: 1 };
  } };

  const updateRes = response();
  await couponsController.updateCoupon({ params: { id: 'cpn-2' }, body: { description: 'Updated note' } }, updateRes);
  assert.equal(updateRes.statusCode, 200);
  assert.equal(updateRes.body.data.description, 'Updated note');

  const deleteRes = response();
  await couponsController.deactivateCoupon({ params: { id: 'cpn-2' } }, deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.ok(statements.some((statement) => typeof statement !== 'string' && statement.sql.includes('SET is_active = 0')));
  assert.ok(statements.every((statement) => typeof statement === 'string' || !statement.sql.startsWith('DELETE FROM coupons')));
});

test('storefront coupon feed returns only coupons currently active and within their dates', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.startsWith('SELECT id, code')) return { rows: [{
      id: 'cpn-3', code: 'LIVE10', description: 'Live offer', discount_type: 'percentage',
      discount_value: 10, max_discount_amount: null, min_order_amount: 0,
      starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z',
      usage_limit: null, usage_count: 0, is_active: 1, created_at: '2026-10-01', updated_at: '2026-10-01',
    }] };
    return { rows: [], rowsAffected: 0 };
  } };

  const res = response();
  await couponsController.getActiveCoupons(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].code, 'LIVE10');
  const selectQuery = statements.find((s) => s.startsWith('SELECT id, code'));
  assert.ok(selectQuery);
  assert.match(selectQuery, /datetime\(starts_at\) <= datetime\('now'\)/);
  assert.match(selectQuery, /usage_count < usage_limit/);
});

test('coupon management middleware rejects missing/non-admin sessions and accepts an admin JWT', () => {
  const customerToken = jwt.sign({ role: 'customer' }, jwtSecret);
  const adminToken = jwt.sign({ role: 'admin', userId: 'admin-test' }, jwtSecret);
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const missingResponse = response();
    let missingNextCalled = false;
    requireCouponAdmin({ headers: {}, cookies: {} }, missingResponse, () => { missingNextCalled = true; });
    assert.equal(missingResponse.statusCode, 401);
    assert.equal(missingNextCalled, false);

    const customerResponse = response();
    let customerNextCalled = false;
    requireCouponAdmin({ headers: { authorization: `Bearer ${customerToken}` }, cookies: {} }, customerResponse, () => { customerNextCalled = true; });
    assert.equal(customerResponse.statusCode, 403);
    assert.equal(customerNextCalled, false);

    const adminResponse = response();
    let adminNextCalled = false;
    const adminRequest = { headers: {}, cookies: { token: adminToken } };
    requireCouponAdmin(adminRequest, adminResponse, () => { adminNextCalled = true; });
    assert.equal(adminNextCalled, true);
    assert.equal(adminRequest.user.role, 'admin');
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('coupon middleware preserves the local-development mock admin convention', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const res = response();
    let nextCalled = false;
    const req = { headers: {}, cookies: {} };
    requireCouponAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.role, 'admin');
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});


test('coupon preview validates against live catalog prices and returns the discounted checkout total', async () => {
  const statements = [];
  const now = Date.now();
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(statement);
    if (sql.includes('FROM products p')) return { rows: [{ product_name: 'Rohu', sku: 'ROHU-1', size: 'Standard', weight: '1 kg', price: 100 }] };
    if (sql.includes('SELECT setting_key, setting_value FROM delivery_pricing_settings')) return { rows: [
      { setting_key: 'origin_address', setting_value: 'RedVeg, Kolkata' },
      { setting_key: 'rate_per_km', setting_value: '10' },
      { setting_key: 'origin_latitude', setting_value: '22.634926' },
      { setting_key: 'origin_longitude', setting_value: '88.4076512' },
    ] };
    if (sql.startsWith('SELECT * FROM coupons WHERE code')) return { rows: [{
      id: 'cpn-live', code: 'SAVE10', is_active: 1, discount_type: 'percentage', discount_value: 10,
      max_discount_amount: null, min_order_amount: 100,
      starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(),
      usage_limit: 5, usage_count: 0,
    }] };
    return { rows: [], rowsAffected: 0 };
  } };
  currentDbs = { availablePincodes: { execute: async () => ({ rows: [{ is_serviceable: 1 }] }) } };

  const res = response();
  await withDeliveryRouteMock(() => couponsController.validateCoupon({ body: {
    code: 'save10',
    cartItems: [{ productId: 'P1', variantId: 'V1', quantity: 2 }],
    destination: { pincode: '700065', latitude: 22.64, longitude: 88.42 },
  } }, res));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.coupon.code, 'SAVE10');
  assert.equal(res.body.data.subtotalAmount, 200);
  assert.equal(res.body.data.discountAmount, 20);
  assert.equal(res.body.data.deliveryFee, 49);
  assert.equal(res.body.data.totalAmount, 229);
  assert.ok(statements.some((statement) => typeof statement !== 'string' && statement.sql.includes('FROM products p')));
  assert.ok(statements.some((statement) => typeof statement !== 'string' && statement.sql.includes('WHERE code = ? COLLATE NOCASE')));
  currentDbs = {};
});

test('a customer who already redeemed a coupon is rejected by the live coupon validator', async () => {
  const now = Date.now();
  const coupon = {
    id: 'cpn-once', code: 'ONCE10', is_active: 1, discount_type: 'percentage', discount_value: 10,
    max_discount_amount: null, min_order_amount: 0,
    starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(),
    usage_limit: null, usage_count: 1,
  };
  const db = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.startsWith('SELECT * FROM coupons WHERE code')) return { rows: [coupon] };
    if (sql.includes('FROM coupon_redemptions')) return { rows: [{ order_id: 'ORD-USED' }] };
    return { rows: [], rowsAffected: 1 };
  } };
  await assert.rejects(
    couponService.findApplicableCoupon(db, 'ONCE10', 500, {
      id: 'firebase-customer-1', key: 'firebase:firebase-customer-1', ordersDb: { execute: async () => ({ rows: [] }) },
    }),
    (error) => error.statusCode === 400 && /already used/i.test(error.message)
  );
});

test('historical successful orders also prevent a repeat coupon use', async () => {
  const now = Date.now();
  const orderQueries = [];
  const db = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.startsWith('SELECT * FROM coupons WHERE code')) return { rows: [{
      id: 'cpn-old', code: 'OLD10', is_active: 1, discount_type: 'fixed', discount_value: 10,
      min_order_amount: 0, starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 86_400_000).toISOString(), usage_limit: null, usage_count: 2,
    }] };
    return { rows: [] };
  } };
  const ordersDb = { execute: async (statement) => {
    orderQueries.push(statement);
    return { rows: [{ id: 'ORD-OLD-USE' }] };
  } };
  await assert.rejects(
    couponService.findApplicableCoupon(db, 'OLD10', 500, {
      id: 'firebase-customer-old', key: 'firebase:firebase-customer-old', ordersDb,
    }),
    (error) => error.statusCode === 400 && /already used/i.test(error.message)
  );
  assert.match(orderQueries[0].sql, /firebase_uid = \? OR user_id = \?/);
  assert.match(orderQueries[0].sql, /NOT IN \('cancelled', 'canceled'\)/);
});

test('concurrent coupon redemption for the same customer fails on the unique redemption constraint', async () => {
  const statements = [];
  const db = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.startsWith('INSERT INTO coupon_redemptions')) {
      throw new Error('UNIQUE constraint failed: coupon_redemptions.coupon_id, coupon_redemptions.customer_key');
    }
    return { rows: [], rowsAffected: 1 };
  } };
  await assert.rejects(
    couponService.reserveCouponUsage(db, 'cpn-once', 'firebase:firebase-customer-1', 'ORD-SECOND'),
    (error) => error.statusCode === 409 && /already used/i.test(error.message)
  );
  assert.ok(statements.some((sql) => sql.includes('usage_count = usage_count + 1')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO coupon_redemptions')));
});

test('checkout re-prices the basket, reserves limited coupon use and persists the breakdown instead of trusting client discounts', async () => {
  const now = Date.now();
  const catalogStatements = [];
  const orderStatements = [];
  const couponRow = {
    id: 'cpn-checkout', code: 'SAVE10', is_active: 1, discount_type: 'percentage', discount_value: 10,
    max_discount_amount: null, min_order_amount: 100,
    starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(),
    usage_limit: 1, usage_count: 0,
  };
  const orderColumns = ['id', 'user_id', 'customer_id', 'firebase_uid', 'cart_snapshot', 'total_amount', 'customer_name', 'customer_phone', 'customer_address', 'status', 'is_archived', 'created_at', 'order_date', 'coupon_id', 'coupon_code', 'subtotal_amount', 'discount_amount', 'delivery_fee'];
  const executeCatalog = async (statement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      catalogStatements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
      if (sql.includes('FROM products p')) return { rows: [{ product_name: 'Rohu', sku: 'ROHU-1', size: 'Standard', weight: '1 kg', price: 100 }] };
      if (sql.includes('SELECT setting_key, setting_value FROM delivery_pricing_settings')) return { rows: [
        { setting_key: 'origin_address', setting_value: 'RedVeg, Kolkata' },
        { setting_key: 'rate_per_km', setting_value: '10' },
        { setting_key: 'origin_latitude', setting_value: '22.634926' },
        { setting_key: 'origin_longitude', setting_value: '88.4076512' },
      ] };
      if (sql.startsWith('SELECT * FROM coupons WHERE code')) return { rows: [couponRow] };
      if (sql.includes('FROM delivery_slots WHERE id = ? AND is_active = 1')) return { rows: [{ id: 'slot-1', name: 'Slot 1', start_time: '08:10', end_time: '10:00' }] };
      if (sql.startsWith('UPDATE coupons SET usage_count = usage_count + 1')) return { rowsAffected: 1, rows: [] };
      if (sql.startsWith('UPDATE variants SET stock_count = stock_count -')) return { rowsAffected: 1, rows: [] };
      return { rows: [], rowsAffected: 1 };
  };
  currentDbs = {
    catalog: {
      execute: executeCatalog,
      transaction: async () => {
        catalogStatements.push({ sql: 'BEGIN IMMEDIATE TRANSACTION', args: [] });
        return {
          execute: executeCatalog,
          commit: async () => { catalogStatements.push({ sql: 'COMMIT', args: [] }); },
          rollback: async () => { catalogStatements.push({ sql: 'ROLLBACK', args: [] }); },
          close: async () => {},
        };
      },
    },
    orders: { execute: async (statement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      orderStatements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
      if (sql === 'PRAGMA table_info(orders)') return { rows: orderColumns.map((name) => ({ name })) };
      return { rows: [], rowsAffected: 1 };
    } },
    availablePincodes: { execute: async () => ({ rows: [{ is_serviceable: 1 }] }) },
  };

  const res = response();
  await withDeliveryRouteMock(() => ordersController.createOrder({ firebaseCustomer: { uid: 'firebase-user-1' }, body: {
    cartItems: [{ productId: 'P1', variantId: 'V1', quantity: 2 }],
    couponCode: 'save10', discountAmount: 9999,
    deliveryDestination: { pincode: '700065', latitude: 22.64, longitude: 88.42 },
    deliverySlotId: 'slot-1',
    customer: { name: 'Asha Rao', phoneNo: '9876543210', address: 'Kolkata' },
  } }, res));

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.subtotalAmount, 200);
  assert.equal(res.body.data.discountAmount, 20);
  assert.equal(res.body.data.deliveryFee, 49);
  assert.equal(res.body.data.totalAmount, 229);
  assert.equal(res.body.data.couponCode, 'SAVE10');
  assert.equal(res.body.data.status, 'pending');
  const insert = orderStatements.find((statement) => statement.sql.includes('INSERT INTO orders'));
  assert.ok(insert);
  assert.match(insert.sql, /customer_id, firebase_uid, cart_snapshot/);
  assert.equal(insert.args[2], null);
  assert.equal(insert.args[3], 'firebase-user-1');
  assert.match(insert.sql, /coupon_id, coupon_code, subtotal_amount,\s+discount_amount, delivery_fee, payment_status, received_amount, balance_amount/);
  assert.match(insert.sql, /'pending'/);
  assert.deepEqual(insert.args.slice(9), ['cpn-checkout', 'SAVE10', 200, 20, 49, 229, 4.9, 10, 'slot-1', 'Slot 1', '08:10-10:00']);
  assert.ok(catalogStatements.some((statement) => statement.sql === 'BEGIN IMMEDIATE TRANSACTION'));
  const stockUpdate = catalogStatements.find((statement) => statement.sql.startsWith('UPDATE variants SET stock_count = stock_count -'));
  assert.ok(stockUpdate);
  assert.deepEqual(stockUpdate.args, [2, 'V1', 'P1', 2]);
  assert.ok(catalogStatements.some((statement) => statement.sql.includes('usage_count = usage_count + 1')));
  assert.ok(catalogStatements.some((statement) => statement.sql === 'COMMIT'));
  assert.match(res.body.data.whatsappMessage, /\*Order status:\* Pending/);
  assert.match(res.body.data.whatsappMessage, /\*Phone:\* 9876543210/);
  assert.match(res.body.data.whatsappMessage, /Rohu.*Standard \/ 1 kg × 2 @ ₹100\.00 = ₹200\.00/);
  assert.ok(res.body.data.whatsappMessage.includes('*Coupon (SAVE10):* −₹20.00'));
  assert.match(res.body.data.whatsappMessage, /Please confirm this order and payment with me on WhatsApp/);
  assert.doesNotMatch(res.body.data.whatsappMessage, /^https:\/\//);
  currentDbs = {};
});

test('admin cancellation releases the coupon usage reserved by the pending order', async () => {
  const orderStatements = [];
  const catalogStatements = [];
  const orderColumns = ['id', 'coupon_id', 'coupon_code', 'subtotal_amount', 'discount_amount', 'delivery_fee'];
  currentDbs = {
    orders: { execute: async (statement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      orderStatements.push(sql);
      if (sql === 'PRAGMA table_info(orders)') return { rows: orderColumns.map((name) => ({ name })) };
      if (sql.startsWith('SELECT coupon_id')) return { rows: [{ coupon_id: 'cpn-checkout' }] };
      return { rows: [], rowsAffected: 1 };
    } },
    catalog: {
      execute: async (statement) => {
        catalogStatements.push(typeof statement === 'string' ? statement : statement.sql);
        return { rows: [], rowsAffected: 1 };
      },
      transaction: async () => ({
        execute: async (statement) => {
          catalogStatements.push(typeof statement === 'string' ? statement : statement.sql);
          return { rows: [], rowsAffected: 1 };
        },
        commit: async () => {},
        rollback: async () => {},
      }),
    },
  };
  const res = response();
  await ordersController.cancelOrder({ params: { id: 'ORD-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(orderStatements.some((sql) => sql.startsWith('UPDATE orders SET status = \'cancelled\'')));
  assert.ok(catalogStatements.some((sql) => sql.startsWith('DELETE FROM coupon_redemptions')));
  assert.ok(catalogStatements.some((sql) => sql.includes('usage_count - 1')));
  currentDbs = {};
});


test('existing orders tables receive coupon breakdown columns once without disturbing old rows', async () => {
  const statements = [];
  const columns = new Set(['id', 'total_amount', 'cart_snapshot']);
  const db = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql === 'PRAGMA table_info(orders)') return { rows: [...columns].map((name) => ({ name })) };
    const match = sql.match(/^ALTER TABLE orders ADD COLUMN ([a-z_]+)/i);
    if (match) columns.add(match[1]);
    return { rows: [], rowsAffected: 1 };
  } };

  await ensureOrderCouponColumns(db);
  await ensureOrderCouponColumns(db);
  assert.deepEqual([...columns].filter((name) => ['coupon_id', 'coupon_code', 'subtotal_amount', 'discount_amount', 'delivery_fee', 'delivery_distance_km', 'delivery_rate_per_km'].includes(name)).sort(), ['coupon_code', 'coupon_id', 'delivery_distance_km', 'delivery_fee', 'delivery_rate_per_km', 'discount_amount', 'subtotal_amount']);
  assert.equal(statements.filter((sql) => sql.startsWith('ALTER TABLE orders ADD COLUMN')).length, 7);
});


test('admin dashboard daily metrics count delivered orders as sales', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.includes(' as start')) return { rows: [{ start: '2026-10-03 00:00:00' }] };
    if (sql.includes(' as end')) return { rows: [{ end: '2026-10-04 00:00:00' }] };
    if (sql.includes('pending_count')) return { rows: [{ pending_count: 0 }] };
    if (sql.includes('order_count')) return { rows: [{ order_count: 1, revenue: 1250 }] };
    return { rows: [] };
  } };

  const res = response();
  await statsController.getStats(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.find((metric) => metric.label === 'Revenue today').value, '₹1,250');
  const dailyQueries = statements.filter((sql) => sql.includes('order_count'));
  assert.equal(dailyQueries.length, 2);
  assert.ok(dailyQueries.every((sql) => sql.includes("LOWER(status) IN ('approved', 'completed', 'delivered')")));
});


test('analytics reports historical invoice, received and outstanding amounts separately from online earnings', async () => {
  const statements = [];
  const invoices = [
    { invoice_no: 'INV-1', party_key: 'RP-1', sale_date: '2026-10-03', transaction_type: 'Sale', payment_status: 'Paid', total_amount: 1000, received_amount: 1000, balance_amount: 0, period: '2026-10' },
    { invoice_no: 'INV-2', party_key: 'RP-2', sale_date: '2026-09-01', transaction_type: 'Sale', payment_status: 'Unpaid', total_amount: 200, received_amount: 0, balance_amount: 200, period: '2026-09' },
    { invoice_no: 'INV-3', party_key: 'RP-3', sale_date: '2026-10-01', transaction_type: 'Sale', payment_status: 'Partial', total_amount: 100, received_amount: 50, balance_amount: 50, period: '2026-10' },
    { invoice_no: 'INV-4', party_key: 'RP-4', sale_date: '2026-09-02', transaction_type: 'Cancelled Sale', payment_status: 'Cancelled', total_amount: 999, received_amount: 0, balance_amount: 999, period: '2026-09' },
  ];
  const ordersDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.includes('AS lifetime_revenue')) return { rows: [{ lifetime_revenue: 4200 }] };
    if (sql.includes('FROM imported_sales_invoices')) return { rows: invoices };
    if (sql.includes('FROM orders')) return { rows: [] };
    return { rows: [], rowsAffected: 0 };
  } };
  const customerDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql.includes('FROM customer_invoice_payment_overrides')) return { rows: [{
      report_party_id: 'RP-2', invoice_no: 'INV-2', payment_status: 'Paid', received_amount: 200,
      balance_amount: 0, updated_at: '2026-10-03 12:00:00', updated_by: 'admin-1',
    }] };
    return { rows: [], rowsAffected: 1 };
  } };
  currentDbs = { orders: ordersDb, customer: customerDb };

  const res = response();
  await statsController.getRevenueStats(request({ range: 'lifetime', bucket: 'month' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.summary.lifetimeRevenue, 4200);
  assert.deepEqual(res.body.data.importedSales, {
    invoiceCount: 3,
    invoicedAmount: 1300,
    receivedAmount: 1250,
    outstandingAmount: 50,
    cancelledInvoiceCount: 1,
    reportFrom: '2026-09-01',
    reportTo: '2026-10-03',
  });
  assert.equal(res.body.data.series[0].revenue, 0);
  assert.equal(res.body.data.series[0].importedInvoiced, 200);
  assert.equal(res.body.data.series[0].importedCollected, 200);
  assert.equal(res.body.data.series[1].importedInvoiced, 1100);
  assert.equal(res.body.data.series[1].importedCollected, 1050);
  const reportQueries = statements.filter((sql) => sql.includes('FROM imported_sales_invoices'));
  assert.equal(reportQueries.length, 1);
  assert.match(reportQueries[0], /transaction_type/);
  assert.match(reportQueries[0], /payment_status/);
  assert.ok(statements.some((sql) => sql.includes('FROM customer_invoice_payment_overrides')));
  assert.doesNotMatch(reportQueries[0], /payment_status_override/);
  currentDbs = {};
});

test('customer directory includes report-only names without treating them as real accounts', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql === 'PRAGMA table_info(orders)') return { rows: ['id', 'customer_id', 'firebase_uid', 'created_at'].map((name) => ({ name })) };
    if (sql.includes('FROM imported_sales_parties')) return { rows: [{ customer_id: 'RP-REPORT-1', name: 'Report party', created_at: '2026-10-03', first_sale_date: '2026-09-01' }] };
    if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: 1 }] };
    if (sql.includes('LIMIT ? OFFSET ?')) return { rows: [{
      customer_id: 'RP-REPORT-1', name: 'Report party', phoneNo: null,
      created_at: '2026-10-03', first_sale_date: '2026-09-01', recordType: 'sales_report',
    }] };
    return { rows: [], rowsAffected: 0 };
  } };

  const res = response();
  await customersController.getAllCustomers(request({ limit: '25', offset: '0' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.data[0].recordType, 'sales_report');
  assert.equal(res.body.data[0].phoneNo, null);
  assert.ok(statements.some((sql) => sql.includes('FROM imported_sales_parties')));
  assert.ok(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS imported_sales_parties')));
});


test('customer directory returns paid, partial, unpaid and cleared/due totals from the sales report', async () => {
  const reportPartyId = 'RP-REPORT-1';
  const customerStatements = [];
  const ordersStatements = [];
  const invoiceRows = [
    { invoice_no: 'INV-PAID', party_key: reportPartyId, transaction_type: 'Sale', payment_status: 'Paid', total_amount: 100, received_amount: 100, balance_amount: 0 },
    { invoice_no: 'INV-PARTIAL', party_key: reportPartyId, transaction_type: 'Sale', payment_status: 'Partial', total_amount: 100, received_amount: 60, balance_amount: 40 },
    { invoice_no: 'INV-UNPAID', party_key: reportPartyId, transaction_type: 'Sale', payment_status: 'Unpaid', total_amount: 100, received_amount: 0, balance_amount: 100 },
    { invoice_no: 'INV-CANCELLED', party_key: reportPartyId, transaction_type: 'Cancelled Sale', payment_status: 'Cancelled', total_amount: 500, received_amount: 0, balance_amount: 500 },
  ];
  currentDbs = {
    customer: { execute: async (statement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      customerStatements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
      if (sql.includes('FROM imported_sales_parties')) return { rows: [{ customer_id: reportPartyId, name: 'Report party', created_at: '2026-10-03', first_sale_date: '2026-09-01' }] };
      if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: 1 }] };
      if (sql.includes('LIMIT ? OFFSET ?')) return { rows: [{
        customer_id: reportPartyId, name: 'Report party', phoneNo: null,
        created_at: '2026-10-03', first_sale_date: '2026-09-01', recordType: 'sales_report',
      }] };
      if (sql.includes('FROM customer_invoice_payment_overrides')) return { rows: [{
        report_party_id: reportPartyId, invoice_no: 'INV-PARTIAL', payment_status: 'Partial',
        received_amount: 80, balance_amount: 20, updated_at: '2026-10-03 12:00:00', updated_by: 'admin-1',
      }] };
      return { rows: [], rowsAffected: 0 };
    } },
    orders: { execute: async (statement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      ordersStatements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
      if (sql === 'PRAGMA table_info(orders)') return { rows: ['id', 'customer_id', 'firebase_uid', 'created_at'].map((name) => ({ name })) };
      if (sql.includes('FROM imported_sales_invoices')) return { rows: invoiceRows };
      return { rows: [], rowsAffected: 0 };
    } },
  };

  const res = response();
  await customersController.getAllCustomers(request({ limit: '25', offset: '0' }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.salesReportSummary, {
    invoiceCount: 3, paidInvoiceCount: 1, partialInvoiceCount: 1,
    unpaidInvoiceCount: 1, clearedAmount: 180, dueAmount: 120,
    cancelledInvoiceCount: 1,
  });
  assert.deepEqual(res.body.data[0].salesReport, {
    invoiceCount: 3, paidInvoiceCount: 1, partialInvoiceCount: 1,
    unpaidInvoiceCount: 1, clearedAmount: 180, dueAmount: 120,
    cancelledInvoiceCount: 1,
  });
  assert.ok(customerStatements.some((statement) => statement.sql.includes('FROM customer_invoice_payment_overrides')));
  assert.ok(ordersStatements.some((statement) => statement.sql.includes('FROM imported_sales_invoices')));
  assert.ok(ordersStatements.every((statement) => !statement.sql.includes('payment_status_override')));
  assert.ok(customerStatements.some((statement) => statement.sql.includes('FROM imported_sales_parties')));
  currentDbs = {};
});


test('admin can update a report invoice payment and restore its imported source values', async () => {
  const original = {
    invoice_no: 'INV-1', order_no: 'SO-1', sale_date: '2026-09-01', party_key: 'RP-PAY-1',
    transaction_type: 'Sale', payment_status: 'Unpaid', total_amount: 100,
    received_amount: 0, balance_amount: 100, line_item_count: 2,
  };
  let override = null;
  const customerWrites = [];
  const ordersWrites = [];
  const customerDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    const args = typeof statement === 'string' ? [] : statement.args;
    customerWrites.push({ sql, args });
    if (sql.includes('SELECT report_party_id FROM imported_sales_parties')) return { rows: [{ report_party_id: 'RP-PAY-1' }] };
    if (sql.includes('INSERT INTO customer_invoice_payment_overrides')) {
      override = { status: args[2], received: args[3], due: args[4], updatedBy: args[5] };
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.includes('DELETE FROM customer_invoice_payment_overrides')) {
      override = null;
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.includes('FROM customer_invoice_payment_overrides')) return { rows: override ? [{
      report_party_id: 'RP-PAY-1', invoice_no: 'INV-1', payment_status: override.status,
      received_amount: override.received, balance_amount: override.due,
      updated_at: '2026-10-03 12:00:00', updated_by: override.updatedBy,
    }] : [] };
    return { rows: [], rowsAffected: 1 };
  } };
  const ordersDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    ordersWrites.push(sql);
    if (sql.includes('FROM imported_sales_invoices') && sql.includes('WHERE invoice_no = ? AND party_key = ?')) return { rows: [{ ...original, order_no: 'SO-1', party_key: 'RP-PAY-1' }] };
    if (sql.includes('FROM imported_sales_invoices WHERE party_key = ?')) return { rows: [{ ...original, order_no: 'SO-1', party_key: 'RP-PAY-1' }] };
    return { rows: [], rowsAffected: 1 };
  } };
  currentDbs = { customer: customerDb, orders: ordersDb };

  const updateRes = response();
  await customersController.updateCustomerSalesInvoicePayment({
    params: { customerId: 'RP-PAY-1' },
    body: { invoiceNo: 'INV-1', paymentStatus: 'partial', dueAmount: 40 },
    user: { userId: 'admin-7' },
  }, updateRes);
  assert.equal(updateRes.statusCode, 200);
  assert.deepEqual({ status: updateRes.body.data.paymentStatus, received: updateRes.body.data.receivedAmount, due: updateRes.body.data.dueAmount, overridden: updateRes.body.data.isOverridden }, { status: 'Partial', received: 60, due: 40, overridden: true });
  assert.equal(override.updatedBy, 'admin-7');
  assert.ok(customerWrites.some((entry) => entry.sql.includes('INSERT INTO customer_invoice_payment_overrides')));
  assert.ok(customerWrites.some((entry) => entry.sql.includes('CREATE TABLE IF NOT EXISTS customer_invoice_payment_overrides')));
  assert.ok(ordersWrites.every((sql) => !sql.startsWith('UPDATE imported_sales_invoices')));

  const listRes = response();
  await customersController.getCustomerSalesInvoices({ params: { customerId: 'RP-PAY-1' } }, listRes);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.data[0].paymentStatus, 'Partial');
  assert.equal(listRes.body.data[0].dueAmount, 40);

  const resetRes = response();
  await customersController.updateCustomerSalesInvoicePayment({ params: { customerId: 'RP-PAY-1' }, body: { invoiceNo: 'INV-1', reset: true } }, resetRes);
  assert.equal(resetRes.statusCode, 200);
  assert.equal(resetRes.body.data.paymentStatus, 'Unpaid');
  assert.equal(resetRes.body.data.dueAmount, 100);
  assert.equal(resetRes.body.data.isOverridden, false);
  assert.ok(customerWrites.some((entry) => entry.sql.includes('DELETE FROM customer_invoice_payment_overrides')));
  assert.equal(original.payment_status, 'Unpaid');
  assert.equal(original.balance_amount, 100);
  currentDbs = {};
});


test('invalid invoice payment combinations are rejected without changing Turso rows', async () => {
  let writes = 0;
  const customerDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.includes('SELECT report_party_id FROM imported_sales_parties')) return { rows: [{ report_party_id: 'RP-PAY-2' }] };
    if (sql.includes('INSERT INTO customer_invoice_payment_overrides') || sql.includes('DELETE FROM customer_invoice_payment_overrides')) writes++;
    return { rows: [], rowsAffected: 1 };
  } };
  const ordersDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql === 'PRAGMA table_info(imported_sales_invoices)') return { rows: ['invoice_no', 'payment_status', 'total_amount'].map((name) => ({ name })) };
    if (sql.includes('FROM imported_sales_invoices WHERE invoice_no = ? AND party_key = ?')) return { rows: [{ invoice_no: 'INV-2', party_key: 'RP-PAY-2', transaction_type: 'Sale', payment_status: 'Unpaid', total_amount: 100 }] };
    if (sql.includes('UPDATE imported_sales_invoices SET payment_status_override = ?')) writes++;
    return { rows: [], rowsAffected: 1 };
  } };
  currentDbs = { customer: customerDb, orders: ordersDb };
  const res = response();
  await customersController.updateCustomerSalesInvoicePayment({ params: { customerId: 'RP-PAY-2' }, body: { invoiceNo: 'INV-2', paymentStatus: 'paid', dueAmount: 15 } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /zero due/);
  assert.equal(writes, 0);
  currentDbs = {};
});


test('admin can update future store-order payments and the backend computes received amount', async () => {
  const updates = [];
  const paymentColumns = ['id', 'total_amount', 'payment_status', 'received_amount', 'balance_amount', 'payment_updated_at', 'payment_updated_by'];
  const ordersDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    const args = typeof statement === 'string' ? [] : statement.args;
    if (sql === 'PRAGMA table_info(orders)') return { rows: paymentColumns.map((name) => ({ name })) };
    if (sql.includes('SELECT total_amount, status FROM orders')) return { rows: [{ total_amount: 200, status: 'delivered' }] };
    if (sql.startsWith('UPDATE orders SET payment_status = ?')) { updates.push({ sql, args }); return { rowsAffected: 1, rows: [] }; }
    return { rows: [], rowsAffected: 1 };
  } };
  currentDbs = { orders: ordersDb };
  const res = response();
  await ordersController.updateOrderPayment({ params: { id: 'RV-200' }, body: { paymentStatus: 'partial', dueAmount: 75 }, user: { userId: 'admin-9' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { id: 'RV-200', paymentStatus: 'Partial', receivedAmount: 125, dueAmount: 75 });
  assert.deepEqual(updates[0].args, ['Partial', 125, 75, 'admin-9', 'RV-200']);

  const invalid = response();
  await ordersController.updateOrderPayment({ params: { id: 'RV-200' }, body: { paymentStatus: 'paid', dueAmount: 5 } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(updates.length, 1);
  currentDbs = {};
});


test('existing order tables receive payment columns once and backfill outstanding order totals', async () => {
  const statements = [];
  const columns = new Set(['id', 'total_amount']);
  const db = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push(sql);
    if (sql === 'PRAGMA table_info(orders)') return { rows: [...columns].map((name) => ({ name })) };
    const match = sql.match(/^ALTER TABLE orders ADD COLUMN ([a-z_]+)/i);
    if (match) columns.add(match[1]);
    return { rows: [], rowsAffected: 1 };
  } };

  await ensureOrderPaymentColumns(db);
  await ensureOrderPaymentColumns(db);
  assert.deepEqual(['payment_status', 'received_amount', 'balance_amount', 'payment_updated_at', 'payment_updated_by'].filter((name) => columns.has(name)), ['payment_status', 'received_amount', 'balance_amount', 'payment_updated_at', 'payment_updated_by']);
  assert.equal(statements.filter((sql) => sql.startsWith('ALTER TABLE orders ADD COLUMN')).length, 5);
  assert.ok(statements.some((sql) => sql.includes("SET payment_status = 'unpaid'")));
  assert.ok(statements.some((sql) => sql.includes('SET balance_amount = MAX')));
});


test('order payment endpoint is registered on the admin orders router', () => {
  const routeLayer = ordersRouter.stack.find((layer) => layer.route?.path === '/:id/payment');
  assert.ok(routeLayer, 'payment route should be registered before exporting the router');
  assert.equal(routeLayer.route.methods.patch, true);
});


test('admin can mark a confirmed order delivered without forcing unused intermediate statuses', async () => {
  const statements = [];
  currentDb = { execute: async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    statements.push({ sql, args: typeof statement === 'string' ? [] : statement.args });
    if (sql === 'PRAGMA table_info(orders)') return { rows: ['status', 'cancellation_status'].map((name) => ({ name })) };
    if (sql.startsWith('SELECT status')) return { rows: [{ status: 'approved' }] };
    return { rowsAffected: 1, rows: [] };
  } };
  const res = response();
  await ordersController.updateOrderStatus({ params: { id: 'O-CONFIRMED' }, body: { status: 'delivered' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { id: 'O-CONFIRMED', status: 'delivered' });
  const updateStatement = statements.find((s) => s.sql.startsWith('UPDATE orders SET status'));
  assert.ok(updateStatement);
  assert.deepEqual(updateStatement.args, ['delivered', 'O-CONFIRMED', 'out_for_delivery', 'approved', 'confirmed']);
});
