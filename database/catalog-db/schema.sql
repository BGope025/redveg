-- Catalog Database Schema for RedVeg
-- Stores products, variants, and UI settings

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    image_url TEXT, -- URL to image in Cloudinary
    is_active INTEGER DEFAULT 1, -- 1 for active, 0 for inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin-managed category registry; products may exist before they have inventory.
CREATE TABLE IF NOT EXISTS catalog_categories (
    category_slug TEXT PRIMARY KEY,
    category_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Variants table (sizes, weights, prices, stock)
CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL, -- Stock Keeping Unit
    size TEXT, -- e.g., "Small", "Medium", "Large"
    weight TEXT, -- e.g., "500g", "1kg"
    piece_size TEXT CHECK (piece_size IS NULL OR piece_size IN ('Small', 'Medium', 'Large')),
    price REAL NOT NULL, -- Price per unit
    stock_count INTEGER DEFAULT 0, -- Current inventory count
    is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)), -- Admin-controlled variant availability
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- One purchase-verified product review per Firebase customer and product.
CREATE TABLE IF NOT EXISTS product_reviews (
    review_id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    firebase_uid TEXT NOT NULL,
    order_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL DEFAULT '',
    is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (firebase_uid, product_id)
);

-- UI Settings table (for banners, logos, etc.)
CREATE TABLE IF NOT EXISTS ui_settings (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- e.g., 'banner', 'logo', 'favicon'
    name TEXT NOT NULL, -- Descriptive name
    image_url TEXT, -- URL to image in Cloudinary
    link_url TEXT, -- For banners that link to somewhere
    display_order INTEGER DEFAULT 0, -- For ordering multiple items
    is_active INTEGER DEFAULT 1, -- 1 for active, 0 for inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery locations used by the catalog seed and storefront availability checks
CREATE TABLE IF NOT EXISTS delivery_locations (
    pincode TEXT PRIMARY KEY,
    area TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    is_servicealbe INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_pricing_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_slots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO delivery_slots (id, name, start_time, end_time, is_active, sort_order)
VALUES ('slot-1', 'Slot 1', '08:00', '10:00', 1, 1), ('slot-2', 'Slot 2', '11:00', '13:00', 1, 2);

CREATE TABLE IF NOT EXISTS category_image_settings (
    category_slug TEXT PRIMARY KEY,
    category_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO delivery_pricing_settings (setting_key, setting_value)
VALUES ('origin_address', 'Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum Dum, Kolkata, West Bengal 700065'), ('rate_per_km', '10'), ('origin_latitude', '22.634926'), ('origin_longitude', '88.4076512'), ('delivery_radius_km', '5'), ('free_delivery_enabled', '0');

-- Idempotency ledger: stock and coupon reservations are released once per approved cancellation.
CREATE TABLE IF NOT EXISTS order_cancellation_inventory_releases (
    order_id TEXT PRIMARY KEY,
    coupon_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_visible ON product_reviews(product_id, is_visible, created_at);
CREATE INDEX IF NOT EXISTS idx_ui_settings_type ON ui_settings(type);
CREATE INDEX IF NOT EXISTS idx_ui_settings_active ON ui_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_active ON delivery_locations(is_servicealbe);
