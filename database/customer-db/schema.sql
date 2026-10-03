CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  password TEXT NOT NULL,
  phone_no TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_invoice_payment_overrides (
  report_party_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Partial', 'Unpaid')),
  received_amount REAL NOT NULL CHECK (received_amount >= 0),
  balance_amount REAL NOT NULL CHECK (balance_amount >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY (report_party_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_customer_invoice_payments_party
  ON customer_invoice_payment_overrides(report_party_id);
