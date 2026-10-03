const initializedDatabases = new WeakMap();

async function ensureCustomerInvoicePaymentsSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS customer_invoice_payment_overrides (
          report_party_id TEXT NOT NULL,
          invoice_no TEXT NOT NULL,
          payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Partial', 'Unpaid')),
          received_amount REAL NOT NULL CHECK (received_amount >= 0),
          balance_amount REAL NOT NULL CHECK (balance_amount >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT,
          PRIMARY KEY (report_party_id, invoice_no)
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_customer_invoice_payments_party ON customer_invoice_payment_overrides(report_party_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_customer_invoice_payments_invoice ON customer_invoice_payment_overrides(invoice_no)');
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureCustomerInvoicePaymentsSchema };
