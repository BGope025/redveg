const initializedDatabases = new WeakMap();

async function ensureImportedSalesPartiesSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = db.execute(`
      CREATE TABLE IF NOT EXISTS imported_sales_parties (
        report_party_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_file TEXT NOT NULL,
        normalized_name_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        invoice_count INTEGER NOT NULL DEFAULT 0 CHECK (invoice_count >= 0),
        first_sale_date TEXT NOT NULL,
        last_sale_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, normalized_name_hash)
      )
    `).catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureImportedSalesPartiesSchema };
