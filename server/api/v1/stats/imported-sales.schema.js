const initializedDatabases = new WeakMap();

async function ensureImportedSalesSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS imported_sales_invoices (
          invoice_no TEXT PRIMARY KEY,
          order_no TEXT,
          sale_date TEXT NOT NULL,
          party_key TEXT NOT NULL,
          party_name TEXT NOT NULL,
          transaction_type TEXT NOT NULL,
          payment_status TEXT NOT NULL,
          payment_type TEXT,
          total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
          received_amount REAL NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
          balance_amount REAL NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
          items_json TEXT NOT NULL DEFAULT '[]',
          line_item_count INTEGER NOT NULL DEFAULT 0 CHECK (line_item_count >= 0),
          source_id TEXT NOT NULL,
          source_file TEXT NOT NULL,
          source_sha256 TEXT NOT NULL,
          imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const table = await db.execute('PRAGMA table_info(imported_sales_invoices)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      await db.execute('CREATE INDEX IF NOT EXISTS idx_imported_sales_date ON imported_sales_invoices(sale_date)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_imported_sales_party ON imported_sales_invoices(party_key)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureImportedSalesSchema };
