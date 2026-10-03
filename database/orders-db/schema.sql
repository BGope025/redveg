-- Orders Database Schema for RedVeg
-- Stores users and orders

-- Users table (for admin and potentially customers)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'customer', -- 'admin' or 'customer'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    cart_snapshot TEXT NOT NULL, -- JSON string of cart items at time of checkout
    total_amount REAL NOT NULL,
    payment_status TEXT DEFAULT 'unpaid',
    received_amount REAL DEFAULT 0,
    balance_amount REAL,
    payment_updated_at TIMESTAMP,
    payment_updated_by TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'completed', 'cancelled'
    is_archived INTEGER DEFAULT 0, -- 0 for active, 1 for archived (older than 30 days)
    approved_by TEXT, -- ID of admin who approved the order
    approved_at TIMESTAMP, -- When the order was approved
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS Orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS Orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS Orders_is_archived ON orders(is_archived);
CREATE INDEX IF NOT EXISTS Orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS Orders_user_status ON orders(user_id, status);
