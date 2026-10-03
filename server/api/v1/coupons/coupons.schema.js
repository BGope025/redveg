const initializedDatabases = new WeakMap();

async function ensureCouponSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS coupons (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL COLLATE NOCASE UNIQUE,
          description TEXT,
          discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
          discount_value REAL NOT NULL CHECK (discount_value > 0),
          max_discount_amount REAL CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
          min_order_amount REAL NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
          usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (datetime(ends_at) > datetime(starts_at)),
          CHECK (discount_type != 'percentage' OR discount_value <= 100)
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_coupons_active_dates ON coupons(is_active, starts_at, ends_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons(created_at DESC)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureCouponSchema };
