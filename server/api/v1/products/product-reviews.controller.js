const { randomUUID } = require('node:crypto');
const { getDatabaseConnection } = require('../../../config/turso');
const { ensureCustomerAccountSchema } = require('../customers/customer-account.schema');
const { ensureProductReviewsSchema } = require('./product-reviews.schema');
const logger = require('../../../utils/logger');

function snapshotContainsProduct(snapshot, productId) {
  try {
    const items = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    return Array.isArray(items) && items.some((item) => String(item?.productId || item?.product_id || '') === productId);
  } catch {
    return false;
  }
}

async function getProductReviews(req, res) {
  const productId = String(req.params.id || '').trim();
  try {
    const catalogDb = await getDatabaseConnection('catalog');
    await ensureProductReviewsSchema(catalogDb);
    const product = await catalogDb.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [productId] });
    if (!product.rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });

    const [summary, reviews] = await Promise.all([
      catalogDb.execute({
        sql: `SELECT COUNT(*) AS review_count, AVG(rating) AS average_rating
          FROM product_reviews WHERE product_id = ? AND is_visible = 1`,
        args: [productId],
      }),
      catalogDb.execute({
        sql: `SELECT rating, review_text, created_at
          FROM product_reviews WHERE product_id = ? AND is_visible = 1
          ORDER BY created_at DESC LIMIT 50`,
        args: [productId],
      }),
    ]);
    const aggregate = summary.rows[0] || {};
    const data = {
      reviewCount: Number(aggregate.review_count || 0),
      averageRating: aggregate.average_rating == null ? null : Number(Number(aggregate.average_rating).toFixed(2)),
      reviews: reviews.rows.map((row) => ({ rating: Number(row.rating), text: row.review_text || '', createdAt: row.created_at, verifiedPurchase: true })),
      eligibleOrders: [],
    };

    const uid = req.firebaseCustomer?.uid;
    if (uid) {
      const ordersDb = await getDatabaseConnection('orders');
      await ensureCustomerAccountSchema(ordersDb);
      const result = await ordersDb.execute({
        sql: `SELECT id, status, cart_snapshot, created_at FROM orders
          WHERE firebase_uid = ? AND LOWER(TRIM(COALESCE(status, ''))) = 'delivered'
            AND COALESCE(is_archived, 0) = 0 ORDER BY created_at DESC LIMIT 100`,
        args: [uid],
      });
      data.eligibleOrders = result.rows
        .filter((order) => snapshotContainsProduct(order.cart_snapshot, productId))
        .map((order) => ({ id: String(order.id), createdAt: order.created_at }));
      const ownReview = await catalogDb.execute({
        sql: 'SELECT rating, review_text, order_id FROM product_reviews WHERE product_id = ? AND firebase_uid = ? AND is_visible = 1',
        args: [productId, uid],
      });
      data.customerReview = ownReview.rows[0] ? {
        rating: Number(ownReview.rows[0].rating), text: ownReview.rows[0].review_text || '', orderId: ownReview.rows[0].order_id,
      } : null;
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching product reviews:', error);
    return res.status(500).json({ success: false, message: 'Unable to load product reviews right now.' });
  }
}

async function saveProductReview(req, res) {
  const productId = String(req.params.id || '').trim();
  const uid = req.firebaseCustomer?.uid;
  const orderId = String(req.body?.orderId || '').trim();
  const rating = Number(req.body?.rating);
  const reviewText = String(req.body?.text || '').trim();
  if (!uid) return res.status(401).json({ success: false, message: 'Sign in to leave a review.' });
  if (!productId || productId.length > 120 || !orderId || orderId.length > 120) {
    return res.status(400).json({ success: false, message: 'Choose a completed order for this product.' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Choose a rating from 1 to 5 stars.' });
  }
  if (reviewText.length > 1000) return res.status(400).json({ success: false, message: 'Review text must be 1,000 characters or fewer.' });

  try {
    const ordersDb = await getDatabaseConnection('orders');
    await ensureCustomerAccountSchema(ordersDb);
    const orderResult = await ordersDb.execute({
      sql: `SELECT id, status, cart_snapshot FROM orders
        WHERE id = ? AND firebase_uid = ? AND COALESCE(is_archived, 0) = 0`,
      args: [orderId, uid],
    });
    const order = orderResult.rows[0];
    if (!order || String(order.status || '').trim().toLowerCase() !== 'delivered' || !snapshotContainsProduct(order.cart_snapshot, productId)) {
      return res.status(403).json({ success: false, message: 'Reviews are available only for products in your delivered orders.' });
    }

    const catalogDb = await getDatabaseConnection('catalog');
    await ensureProductReviewsSchema(catalogDb);
    const productResult = await catalogDb.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [productId] });
    if (!productResult.rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    await catalogDb.execute({
      sql: `INSERT INTO product_reviews (review_id, product_id, firebase_uid, order_id, rating, review_text)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(firebase_uid, product_id) DO UPDATE SET
          order_id = excluded.order_id, rating = excluded.rating, review_text = excluded.review_text,
          is_visible = 1, updated_at = CURRENT_TIMESTAMP`,
      args: [randomUUID(), productId, uid, orderId, rating, reviewText],
    });
    return getProductReviews({ ...req, params: { ...req.params, id: productId } }, res);
  } catch (error) {
    logger.error('Error saving product review:', error);
    return res.status(500).json({ success: false, message: 'Unable to save your review right now.' });
  }
}

module.exports = { getProductReviews, saveProductReview };
