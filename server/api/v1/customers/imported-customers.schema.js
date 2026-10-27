const initializedDatabases = new WeakMap();

async function ensureImportedCustomersSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS imported_customers (
          imported_customer_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone_number TEXT,
          normalized_phone TEXT UNIQUE,
          address TEXT,
          locality TEXT,
          pincode TEXT,
          notes TEXT,
          dedupe_key TEXT NOT NULL UNIQUE,
          source_file TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_imported_customers_name ON imported_customers(name)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureImportedCustomersSchema };
