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

-- Separate admin staff roles and permissions from customer account roles.
CREATE TABLE IF NOT EXISTS admin_staff_access (
    user_id TEXT PRIMARY KEY,
    staff_role TEXT NOT NULL DEFAULT 'admin',
    permissions_json TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_by TEXT,
    updated_by TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_staff_one_owner
    ON admin_staff_access(staff_role) WHERE staff_role = 'owner';

CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_username TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    http_method TEXT,
    http_status INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_actor ON admin_activity_logs(actor_user_id, created_at);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_id TEXT,
    firebase_uid TEXT,
    cart_snapshot TEXT NOT NULL, -- JSON string of cart items at time of checkout
    total_amount REAL NOT NULL,
    payment_status TEXT DEFAULT 'unpaid',
    received_amount REAL DEFAULT 0,
    balance_amount REAL,
    subtotal_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    delivery_fee REAL NOT NULL DEFAULT 0,
    delivery_distance_km REAL,
    delivery_rate_per_km REAL,
    delivery_slot_id TEXT,
    delivery_slot_name TEXT,
    delivery_slot_time TEXT,
    coupon_id TEXT,
    coupon_code TEXT,
    payment_updated_at TIMESTAMP,
    payment_updated_by TEXT,
    gateway_payment_link_id TEXT,
    gateway_payment_id TEXT,
    razorpay_order_id TEXT,
    items_updated_at TIMESTAMP,
    items_updated_by TEXT,
    order_source TEXT NOT NULL DEFAULT 'Storefront',
    created_by TEXT,
    payment_method TEXT,
    customer_notes TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'completed', 'cancelled'
    is_archived INTEGER DEFAULT 0, -- 0 for active, 1 for archived (older than 30 days)
    approved_by TEXT, -- ID of admin who approved the order
    approved_at TIMESTAMP, -- When the order was approved
    receipt_number TEXT,
    receipt_issued_at TIMESTAMP,
    cancellation_status TEXT NOT NULL DEFAULT 'none',
    cancellation_requested_at TIMESTAMP,
    cancellation_message TEXT,
    cancellation_reviewed_at TIMESTAMP,
    cancellation_reviewed_by TEXT,
    cancellation_review_note TEXT,
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

-- Customer profile data is scoped to the verified Firebase UID.
CREATE TABLE IF NOT EXISTS customer_profiles (
    firebase_uid TEXT PRIMARY KEY,
    display_name TEXT,
    email TEXT,
    phone_number TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS customer_favorites (
    firebase_uid TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (firebase_uid, product_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_firebase_uid_created ON orders(firebase_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_uid ON customer_addresses(firebase_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_favorites_uid ON customer_favorites(firebase_uid, created_at);
