const { getDatabaseConnection } = require('../../../config/turso');

const SITE_ORIGIN = 'https://redveg.in';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[character]);
}

function urlEntry(url, lastModified) {
  const lastmod = lastModified && !Number.isNaN(Date.parse(lastModified))
    ? `<lastmod>${new Date(lastModified).toISOString()}</lastmod>`
    : '';
  return `<url><loc>${xmlEscape(url)}</loc>${lastmod}</url>`;
}

async function getCatalogSitemap(req, res) {
  try {
    const db = await getDatabaseConnection('catalog');
    const [productsResult, categoriesResult] = await Promise.all([
      db.execute({
        sql: `SELECT p.name, p.updated_at
          FROM products p
          WHERE p.is_active = 1
            AND TRIM(COALESCE(p.name, '')) != ''
            AND EXISTS (
              SELECT 1 FROM variants v
              WHERE v.product_id = p.id
                AND v.is_available = 1
                AND COALESCE(v.stock_count, 0) > 0
                AND v.price > 0
            )
          ORDER BY p.name COLLATE NOCASE`,
        args: []
      }),
      db.execute({
        sql: `SELECT DISTINCT p.category
          FROM products p
          WHERE p.is_active = 1
            AND TRIM(COALESCE(p.category, '')) NOT IN ('', 'undefined', 'null', 'n/a', 'na')
            AND EXISTS (
              SELECT 1 FROM variants v
              WHERE v.product_id = p.id
                AND v.is_available = 1
                AND COALESCE(v.stock_count, 0) > 0
                AND v.price > 0
            )
          ORDER BY p.category COLLATE NOCASE`,
        args: []
      })
    ]);

    const entries = [
      urlEntry(`${SITE_ORIGIN}/`),
      urlEntry(`${SITE_ORIGIN}/shop`),
      urlEntry(`${SITE_ORIGIN}/offers`),
      urlEntry(`${SITE_ORIGIN}/terms`),
      urlEntry(`${SITE_ORIGIN}/return-policy`)
    ];
    const seenCategories = new Set();
    for (const row of categoriesResult.rows || []) {
      const slug = slugify(row.category).replace(/^hilsha$/, 'hilsa');
      if (!slug || seenCategories.has(slug)) continue;
      seenCategories.add(slug);
      entries.push(urlEntry(`${SITE_ORIGIN}/shop?category=${encodeURIComponent(slug)}`));
    }

    const seenProducts = new Set();
    for (const row of productsResult.rows || []) {
      const slug = slugify(row.name);
      if (!slug || seenProducts.has(slug)) continue;
      seenProducts.add(slug);
      entries.push(urlEntry(`${SITE_ORIGIN}/product/${encodeURIComponent(slug)}`, row.updated_at));
    }

    res.status(200)
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=300, s-maxage=300')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`);
  } catch (error) {
    console.error('[seo] Failed to generate catalog sitemap:', error);
    res.status(503)
      .type('text/plain')
      .set('Cache-Control', 'no-store')
      .send('Sitemap temporarily unavailable');
  }
}

module.exports = { getCatalogSitemap };
