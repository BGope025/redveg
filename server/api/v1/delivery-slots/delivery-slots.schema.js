const initializedDatabases = new WeakMap();

async function ensureDeliverySlotsSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS delivery_slots (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_delivery_slots_active_order ON delivery_slots(is_active, sort_order)');
      await db.execute({
        sql: `INSERT OR IGNORE INTO delivery_slots (id, name, start_time, end_time, is_active, sort_order)
          VALUES ('slot-1', 'Slot 1', '08:00', '10:00', 1, 10), ('slot-2', 'Slot 2', '11:00', '13:00', 1, 20)`,
        args: [],
      });
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureDeliverySlotsSchema };
