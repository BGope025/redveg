const ensureFinancialTransactionsSchema = async (db) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS financial_transactions (
      id TEXT PRIMARY KEY,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'expense')),
      transaction_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_date
    ON financial_transactions(transaction_date)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_financial_transactions_type
    ON financial_transactions(transaction_type)
  `);
};

module.exports = { ensureFinancialTransactionsSchema };
