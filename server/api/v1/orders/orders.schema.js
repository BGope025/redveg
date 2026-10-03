const initializedDatabases = new WeakMap();
const initializedPaymentDatabases = new WeakMap();

async function ensureOrderCouponColumns(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');

      const additions = [
        ['coupon_id', 'TEXT'],
        ['coupon_code', 'TEXT'],
        ['subtotal_amount', 'REAL NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0)'],
        ['discount_amount', 'REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)'],
        ['delivery_fee', 'REAL NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0)'],
      ];
      for (const [name, definition] of additions) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

async function ensureOrderPaymentColumns(db) {
  let initialization = initializedPaymentDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');

      const additions = [
        ['payment_status', 'TEXT'],
        ['received_amount', 'REAL'],
        ['balance_amount', 'REAL'],
        ['payment_updated_at', 'TEXT'],
        ['payment_updated_by', 'TEXT'],
      ];
      for (const [name, definition] of additions) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }

      await db.execute({
        sql: "UPDATE orders SET payment_status = 'unpaid' WHERE payment_status IS NULL OR TRIM(payment_status) = ''",
        args: [],
      });
      await db.execute({ sql: 'UPDATE orders SET received_amount = 0 WHERE received_amount IS NULL', args: [] });
      await db.execute({
        sql: 'UPDATE orders SET balance_amount = MAX(COALESCE(total_amount, 0) - COALESCE(received_amount, 0), 0) WHERE balance_amount IS NULL',
        args: [],
      });
    })().catch((error) => {
      initializedPaymentDatabases.delete(db);
      throw error;
    });
    initializedPaymentDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureOrderCouponColumns, ensureOrderPaymentColumns };
