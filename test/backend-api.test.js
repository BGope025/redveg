const test = require('node:test');
const assert = require('node:assert/strict');

const turso = require('../server/config/turso');
let currentDb;
const queries = [];
turso.getDatabaseConnection = async () => currentDb;

const productsController = require('../server/api/v1/products/products.controller');
const statsController = require('../server/api/v1/stats/stats.controller');
const campaignsController = require('../server/api/v1/campaigns/campaigns.controller');
const deliveryController = require('../server/api/v1/admin/delivery-locations/delivery-locations.controller');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
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

test('products endpoint maps database variant size, weight, price, and stock_count', async () => {
  queries.length = 0;
  currentDb = dbReturning([{ id: 'P1', name: 'Rohu', is_active: 1, variant_id: 'V1', sku: 'SKU-1', size: 'Standard', weight: '500 g', price: 349, stock_count: 12 }]);
  const res = response();
  await productsController.getAllProducts(request({ limit: '10' }), res);
  assert.equal(res.statusCode, 200);
  const variant = res.body.data[0].variants[0];
  assert.deepEqual({ size: variant.size, weight: variant.weight, price: variant.price, stock: variant.stock, stockCount: variant.stockCount, available: variant.available }, { size: 'Standard', weight: '500 g', price: 349, stock: 12, stockCount: 12, available: true });
  assert.match(queries[0], /stock_count/);
});

test('revenue reports query created_at and return a normalized series', async () => {
  queries.length = 0;
  currentDb = dbReturning([{ period: '2026-10', order_count: 3, revenue: 2100 }]);
  const res = response();
  await statsController.getRevenueStats(request({ range: 'lifetime', bucket: 'month' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.series[0].orders, 3);
  assert.equal(res.body.data.series[0].revenue, 2100);
  assert.match(queries[0], /created_at/);
  assert.doesNotMatch(queries[0], /order_date/);
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
