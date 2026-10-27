const { getDatabaseConnection } = require('../../../../config/turso');
const { ensureCustomerAccountSchema } = require('../../customers/customer-account.schema');
const logger = require('../../../../utils/logger');

function parseCart(value) {
  try {
    const items = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function normalizeSearchValue(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}@.+]+/gu, ' ').trim();
}

function matchesCartSearch(cart, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;
  const queryDigits = normalizedQuery.replace(/\D/g, '');
  const searchable = [cart.customerName, cart.email, cart.phoneNumber,
    ...cart.items.flatMap((item) => [item.productName, item.variantLabel, item.productId, item.variantId])]
    .map(normalizeSearchValue);
  if (searchable.some((value) => value.includes(normalizedQuery))) return true;
  if (queryDigits.length >= 4 && String(cart.phoneNumber || '').replace(/\D/g, '').includes(queryDigits)) return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.length > 1 && tokens.every((token) => searchable.some((value) => value.includes(token)));
}

async function getActiveCustomerCarts(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const ordersDb = await getDatabaseConnection('orders');
    await ensureCustomerAccountSchema(ordersDb);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const search = String(req.query.q || '').trim().slice(0, 120);
    const fetchLimit = search ? 5000 : limit;
    const cartResult = await ordersDb.execute({
      sql: `SELECT c.firebase_uid, c.items_json, c.item_count, c.updated_at,
          p.display_name, p.email, p.phone_number
        FROM customer_active_carts c
        LEFT JOIN customer_profiles p ON p.firebase_uid = c.firebase_uid
        WHERE c.item_count > 0 AND c.updated_at >= datetime('now', '-30 days')
        ORDER BY c.updated_at DESC LIMIT ?`,
      args: [fetchLimit],
    });
    const rows = cartResult.rows.map((row) => ({ ...row, cartItems: parseCart(row.items_json) }));
    const productIds = Array.from(new Set(rows.flatMap((row) => row.cartItems
      .map((item) => String(item?.productId || '').trim()).filter(Boolean))));
    let catalogRows = [];
    if (productIds.length) {
      const catalogDb = await getDatabaseConnection('catalog');
      for (let offset = 0; offset < productIds.length; offset += 400) {
        const productIdBatch = productIds.slice(offset, offset + 400);
        const placeholders = productIdBatch.map(() => '?').join(', ');
        const catalogResult = await catalogDb.execute({
          sql: `SELECT p.id AS product_id, p.name AS product_name, p.image_url,
              p.is_active AS product_active, v.id AS variant_id, v.sku, v.size, v.weight,
              v.price, v.stock_count, v.is_available
            FROM products p JOIN variants v ON v.product_id = p.id
            WHERE p.id IN (${placeholders})`,
          args: productIdBatch,
        });
        catalogRows.push(...catalogResult.rows);
      }
    }
    const catalogMap = new Map(catalogRows.map((item) => [`${item.product_id}:${item.variant_id}`, item]));
    const data = rows.map((row) => {
      const items = row.cartItems.map((item) => {
        const productId = String(item?.productId || '').trim();
        const variantId = String(item?.variantId || '').trim();
        const quantity = Math.max(0, Math.min(99, Math.floor(Number(item?.quantity) || 0)));
        const product = catalogMap.get(`${productId}:${variantId}`);
        const unitPrice = Math.max(0, Number(product?.price) || 0);
        return {
          productId,
          variantId,
          productName: String(product?.product_name || 'Unavailable product'),
          variantLabel: product ? ([product.size, product.weight].filter(Boolean).join(' · ') || product.sku || 'Variant') : 'Unavailable variant',
          imageUrl: product?.image_url || null,
          quantity,
          unitPrice,
          lineTotal: Number((unitPrice * quantity).toFixed(2)),
          available: Boolean(product && Number(product.product_active) === 1 && Number(product.is_available) === 1 && Number(product.stock_count) > 0),
        };
      }).filter((item) => item.productId && item.variantId && item.quantity > 0);
      return {
        customerName: String(row.display_name || '').trim() || 'RedVeg customer',
        email: row.email || null,
        phoneNumber: row.phone_number || null,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        estimatedSubtotal: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)),
        updatedAt: row.updated_at,
        items,
      };
    }).filter((cart) => cart.items.length > 0);
    const matching = search ? data.filter((cart) => matchesCartSearch(cart, search)) : data;
    const result = matching.slice(0, limit);
    return res.status(200).json({ success: true, count: result.length, totalMatches: matching.length, data: result });
  } catch (error) {
    logger.error('Error loading active customer carts:', error);
    return res.status(500).json({ success: false, message: 'Unable to load customer carts right now.' });
  }
}

module.exports = { getActiveCustomerCarts };
