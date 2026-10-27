const initializedDatabases = new WeakMap();
const initializedCatalogDatabases = new WeakMap();

function normalizeCategorySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-and-/g, '-');
}

async function ensureCatalogCategorySchema(db) {
  let initialization = initializedCatalogDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS catalog_categories (
          category_slug TEXT PRIMARY KEY,
          category_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const columns = await db.execute('PRAGMA table_info(catalog_categories)');
      if (!(columns.rows || []).some((column) => column.name === 'is_active')) {
        await db.execute('ALTER TABLE catalog_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))');
      }
      const existing = await db.execute(`
        SELECT DISTINCT TRIM(category) AS category FROM products
        WHERE category IS NOT NULL AND LOWER(TRIM(category)) NOT IN ('', 'undefined', 'null', 'n/a', 'na')
      `);
      for (const row of existing.rows || []) {
        const rawName = String(row.category || '').trim();
        const name = rawName.toLowerCase() === 'hilsha'
          ? 'Hilsa'
          : rawName.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
        const slug = normalizeCategorySlug(name);
        if (!slug) continue;
        await db.execute({
          sql: 'INSERT INTO catalog_categories (category_slug, category_name) VALUES (?, ?) ON CONFLICT(category_slug) DO NOTHING',
          args: [slug, name],
        });
      }
    })().catch((error) => {
      initializedCatalogDatabases.delete(db);
      throw error;
    });
    initializedCatalogDatabases.set(db, initialization);
  }
  await initialization;
}

async function upsertCatalogCategory(db, name) {
  const trimmedName = String(name || '').trim();
  const slug = normalizeCategorySlug(trimmedName);
  if (!slug) return;
  const canonicalName = trimmedName.toLowerCase() === 'hilsha'
    ? 'Hilsa'
    : trimmedName.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
  await db.execute({
    sql: `INSERT INTO catalog_categories (category_slug, category_name) VALUES (?, ?)
      ON CONFLICT(category_slug) DO NOTHING`,
    args: [slug, canonicalName],
  });
}

async function ensureCategoryImageSchema(db) {
  let initialization = initializedDatabases.get(db);
  if (!initialization) {
    initialization = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS category_image_settings (
          category_slug TEXT PRIMARY KEY,
          category_name TEXT NOT NULL,
          image_url TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      initializedDatabases.delete(db);
      throw error;
    });
    initializedDatabases.set(db, initialization);
  }
  await initialization;
}

module.exports = { ensureCategoryImageSchema, ensureCatalogCategorySchema, normalizeCategorySlug, upsertCatalogCategory };
