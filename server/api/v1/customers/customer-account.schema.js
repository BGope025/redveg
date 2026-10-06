const initializedDatabases = new WeakMap();

async function ensureCustomerAccountSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const orderTable = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(orderTable.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');

      for (const [name, definition] of [
        ['customer_id', 'TEXT'],
        ['firebase_uid', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }

      await db.execute(`
        CREATE TABLE IF NOT EXISTS customer_profiles (
          firebase_uid TEXT PRIMARY KEY,
          display_name TEXT,
          email TEXT,
          phone_number TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS customer_addresses (
          address_id TEXT PRIMARY KEY,
          firebase_uid TEXT NOT NULL,
          label TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          phone_number TEXT NOT NULL,
          address_line TEXT NOT NULL,
          locality TEXT NOT NULL,
          landmark TEXT,
          pincode TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_orders_firebase_uid_created ON orders(firebase_uid, created_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_customer_addresses_uid ON customer_addresses(firebase_uid, created_at)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureCustomerAccountSchema };
