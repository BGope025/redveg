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
      const tableInfo = await db.execute('PRAGMA table_info(imported_customers)');
      const columns = new Set(tableInfo.rows.map((row) => String(row.name)));
      for (const [name, definition] of [
        ['address', 'TEXT'],
        ['locality', 'TEXT'],
        ['pincode', 'TEXT'],
        ['notes', 'TEXT'],
        ['source_file', 'TEXT'],
        ['updated_at', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE imported_customers ADD COLUMN ${name} ${definition}`);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
        columns.add(name);
      }
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
