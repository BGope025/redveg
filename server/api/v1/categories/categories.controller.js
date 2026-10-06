const { getDatabaseConnection } = require('../../../config/turso');
const logger = require('../../../utils/logger');

/**
 * Get all unique categories
 * @route GET /api/v1/categories
 */
const getAllCategories = async (req, res) => {
  try {
    const db = await getDatabaseConnection('catalog');

    // Get one representative real product image for every active category.
    // The storefront only fetches a small featured-product page, so deriving
    // category images from that page leaves most category cards empty.
    const result = await db.execute({
      sql: "SELECT CASE WHEN LOWER(TRIM(category)) IN ('hilsa', 'hilsha') THEN 'hilsa' ELSE LOWER(TRIM(category)) END AS category, MAX(image_url) AS image_url FROM products WHERE is_active = 1 AND category IS NOT NULL AND LOWER(TRIM(category)) NOT IN ('', 'undefined', 'null', 'n/a', 'na') AND image_url IS NOT NULL AND image_url != '' AND LOWER(TRIM(image_url)) NOT LIKE 'https://example.com/%' GROUP BY CASE WHEN LOWER(TRIM(category)) IN ('hilsa', 'hilsha') THEN 'hilsa' ELSE LOWER(TRIM(category)) END ORDER BY category",
      args: []
    });

    // Format categories for frontend consumption
    // Return array directly to match frontend expectations
    const categories = result.rows.map((row, index) => {
      // Generate a simple ID from category name
      const id = normalizeCategorySlug(row.category);

      // Provide basic category info
      const categoryData = {
        id: id,
        name: row.category.charAt(0).toUpperCase() + row.category.slice(1).toLowerCase(),
        description: `${row.category} products`,
        image: row.image_url || `/placeholder-${id}.jpg`,
        accent: getRandomAccentColor(index)
      };

      return categoryData;
    });

    res.status(200).json(categories);
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper function to generate varied accent colors for categories
function getRandomAccentColor(index) {
  const colors = [
    '#DCEED8', // Fish - greenish
    '#FBE0D6', // Chicken - peach
    '#F3D8D5', // Mutton - light red
    '#F8E7C9', // Prawns - beige
    '#D8E8EA', // Seafood - light blue
    '#E5E0D7'  // Combos - neutral
  ];
  return colors[index % colors.length] || '#DCEED8';
}

function normalizeCategorySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-and-/g, '-');
}

module.exports = {
  getAllCategories
};


