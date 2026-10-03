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

-- Variants table (sizes, weights, prices, stock)
CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL, -- Stock Keeping Unit
    size TEXT, -- e.g., "Small", "Medium", "Large"
    weight TEXT, -- e.g., "500g", "1kg"
    price REAL NOT NULL, -- Price per unit
    stock_count INTEGER DEFAULT 0, -- Current inventory count
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
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

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_ui_settings_type ON ui_settings(type);
CREATE INDEX IF NOT EXISTS idx_ui_settings_active ON ui_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_active ON delivery_locations(is_servicealbe);
