const initializedDatabases = new WeakMap();
const initializedPaymentDatabases = new WeakMap();
const initializedReceiptDatabases = new WeakMap();
const initializedEditDatabases = new WeakMap();
const initializedDeliveryDatabases = new WeakMap();
const initializedDeliverySlotDatabases = new WeakMap();
const initializedCancellationDatabases = new WeakMap();
const initializedManualOrderDatabases = new WeakMap();

async function ensureManualOrderColumns(db) {
  let initialization = initializedManualOrderDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map(row => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');
      for (const [name, definition] of [
        ['order_source', "TEXT NOT NULL DEFAULT 'Storefront'"],
        ['created_by', 'TEXT'],
        ['payment_method', 'TEXT'],
        ['customer_notes', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
    })().catch(error => {
      initializedManualOrderDatabases.delete(db);
      throw error;
    });
    initializedManualOrderDatabases.set(db, initialization);
  }
  await initialization;
}

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
        ['delivery_distance_km', 'REAL'],
        ['delivery_rate_per_km', 'REAL'],
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
        ['payment_method', 'TEXT'],
        ['received_amount', 'REAL'],
        ['balance_amount', 'REAL'],
        ['payment_updated_at', 'TEXT'],
        ['payment_updated_by', 'TEXT'],
        ['gateway_payment_link_id', 'TEXT'],
        ['gateway_payment_id', 'TEXT'],
        ['razorpay_order_id', 'TEXT'],
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

async function ensureOrderReceiptColumns(db) {
  let initialization = initializedReceiptDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');

      for (const [name, definition] of [
        ['receipt_number', 'TEXT'],
        ['receipt_issued_at', 'TEXT'],
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
        UPDATE orders
        SET receipt_number = 'RV-' || UPPER(HEX(RANDOMBLOB(8))),
            receipt_issued_at = COALESCE(approved_at, updated_at, created_at, CURRENT_TIMESTAMP)
        WHERE receipt_number IS NULL
          AND LOWER(TRIM(COALESCE(status, ''))) IN
            ('approved', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'completed')
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_number
        ON orders(receipt_number) WHERE receipt_number IS NOT NULL
      `);
    })().catch((error) => {
      initializedReceiptDatabases.delete(db);
      throw error;
    });
    initializedReceiptDatabases.set(db, initialization);
  }
  await initialization;
}

async function ensureOrderEditColumns(db) {
  let initialization = initializedEditDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');
      for (const [name, definition] of [
        ['items_updated_at', 'TEXT'],
        ['items_updated_by', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
    })().catch((error) => {
      initializedEditDatabases.delete(db);
      throw error;
    });
    initializedEditDatabases.set(db, initialization);
  }
  await initialization;
}

async function ensureOrderDeliveryColumns(db) {
  let initialization = initializedDeliveryDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');
      for (const [name, definition] of [
        ['delivery_distance_km', 'REAL'],
        ['delivery_rate_per_km', 'REAL'],
        ['delivery_origin_latitude', 'REAL'],
        ['delivery_origin_longitude', 'REAL'],
        ['delivery_destination_latitude', 'REAL'],
        ['delivery_destination_longitude', 'REAL'],
        ['delivery_distance_method', 'TEXT'],
        ['delivery_distance_provider', 'TEXT'],
        ['delivery_origin_address', 'TEXT'],
        ['delivery_matched_address', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
    })().catch((error) => {
      initializedDeliveryDatabases.delete(db);
      throw error;
    });
    initializedDeliveryDatabases.set(db, initialization);
  }
  await initialization;
}

async function ensureOrderDeliverySlotColumns(db) {
  let initialization = initializedDeliverySlotDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');
      for (const [name, definition] of [
        ['delivery_slot_id', 'TEXT'],
        ['delivery_slot_name', 'TEXT'],
        ['delivery_slot_time', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
    })().catch((error) => {
      initializedDeliverySlotDatabases.delete(db);
      throw error;
    });
    initializedDeliverySlotDatabases.set(db, initialization);
  }
  await initialization;
}

async function ensureOrderCancellationColumns(db) {
  let initialization = initializedCancellationDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      const table = await db.execute('PRAGMA table_info(orders)');
      const columns = new Set(table.rows.map((row) => String(row.name)));
      if (!columns.size) throw new Error('Orders table is not initialized');
      for (const [name, definition] of [
        ['cancellation_status', "TEXT NOT NULL DEFAULT 'none'"],
        ['cancellation_requested_at', 'TEXT'],
        ['cancellation_message', 'TEXT'],
        ['cancellation_reviewed_at', 'TEXT'],
        ['cancellation_reviewed_by', 'TEXT'],
        ['cancellation_review_note', 'TEXT'],
      ]) {
        if (columns.has(name)) continue;
        try {
          await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
          columns.add(name);
        } catch (error) {
          if (!/duplicate column name/i.test(String(error.message))) throw error;
        }
      }
      await db.execute("UPDATE orders SET cancellation_status = 'none' WHERE cancellation_status IS NULL OR TRIM(cancellation_status) = ''");
    })().catch((error) => {
      initializedCancellationDatabases.delete(db);
      throw error;
    });
    initializedCancellationDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = {
  ensureOrderCouponColumns,
  ensureOrderPaymentColumns,
  ensureOrderReceiptColumns,
  ensureOrderEditColumns,
  ensureOrderDeliveryColumns,
  ensureOrderDeliverySlotColumns,
  ensureOrderCancellationColumns,
  ensureManualOrderColumns,
};
