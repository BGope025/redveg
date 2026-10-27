const initializedDatabases = new WeakMap();

async function ensureProductReviewsSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS product_reviews (
          review_id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          firebase_uid TEXT NOT NULL,
          order_id TEXT NOT NULL,
          rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
          review_text TEXT NOT NULL DEFAULT '',
          is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (firebase_uid, product_id)
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_product_reviews_product_visible ON product_reviews(product_id, is_visible, created_at)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureProductReviewsSchema };
