const { randomUUID } = require('crypto');

/**
 * Generate a clean order ID in the format: #RV-XXXX
 * Where XXXX is a random 4-digit number
 */
const generateOrderId = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
  return `#RV-${randomNum}`;
};

/**
 * Generate collision-resistant product and variant IDs. These are internal
 * identifiers (not customer-facing numbers), so UUIDs prevent catalog growth
 * from exhausting a small four-digit ID space.
 */
const generateProductId = () => {
  return `PRD-${randomUUID()}`;
};

/** Generate a collision-resistant internal variant ID. */
const generateVariantId = () => {
  return `VAR-${randomUUID()}`;
};

/**
 * Generate a clean user ID in the format: USR-XXXX
 * Where XXXX is a random 4-digit number
 */
const generateUserId = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
  return `USR-${randomNum}`;
};

/**
 * Generate a clean UI ID in the format: UI-XXXX
 * Where XXXX is a random 4-digit number
 */
const generateUiId = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
  return `UI-${randomNum}`;
};

/**
 * Generate a clean campaign ID in the format: CAMP-XXXX
 * Where XXXX is a random 4-digit number
 */
const generateCampaignId = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
  return `CAMP-${randomNum}`;
};

/**
 * Generate cart snapshot from cart items
 * This creates an immutable snapshot of the cart at checkout time
 * @param {Array} cartItems - Array of cart items from frontend
 * @param {object} catalogDb - Database connection for catalog
 * @returns {Promise<Array>} Enhanced cart items with product details
 */
const generateCartSnapshot = async (cartItems, catalogDb) => {
  const snapshot = [];

  for (const item of cartItems) {
    const { productId, variantId, quantity } = item;

    // Get product and variant details from catalog
    const result = await catalogDb.execute({
      sql: `
        SELECT p.name as product_name, v.sku, v.size, v.weight, v.piece_size, v.price, v.stock_count, v.is_available
        FROM products p
        JOIN variants v ON p.id = v.product_id
        WHERE p.id = ? AND v.id = ? AND p.is_active = 1 AND v.is_available = 1
      `,
      args: [productId, variantId]
    });

    if (result.rows.length === 0) {
      throw new Error(`Product or variant not found: ${productId}/${variantId}`);
    }

    const variantDetails = result.rows[0];
    if (Number(variantDetails.stock_count) < quantity) {
      throw new Error(`Insufficient stock for ${variantId}`);
    }

    snapshot.push({
      productId,
      variantId,
      name: variantDetails.product_name,
      sku: variantDetails.sku,
      size: variantDetails.size,
      weight: variantDetails.weight,
      piece_size: variantDetails.piece_size || null,
      variant: [variantDetails.size, variantDetails.weight, variantDetails.piece_size].filter(Boolean).join(' / '),
      price: parseFloat(variantDetails.price),
      quantity: quantity
    });
  }

  return snapshot;
};

module.exports = {
  generateOrderId,
  generateProductId,
  generateVariantId,
  generateUserId,
  generateUiId,
  generateCampaignId,
  generateCartSnapshot
};
