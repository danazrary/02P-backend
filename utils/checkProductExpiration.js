/**
 * Check and clean expired discounts and free delivery for products
 * @param {Array} products - Array of product objects from database
 * @returns {Promise<Array>} - Array of products with expired data cleaned
 */
export async function checkAndCleanProductExpiration(products) {
  const currentDate = new Date();
  const updatedProducts = [];

  for (const product of products) {
    let needsUpdate = false;
    const updates = {};

    // Check discount expiration
    if (product.hasDiscount && product.discountEndDate) {
      const discountEndDate = new Date(product.discountEndDate);
      if (discountEndDate < currentDate) {
        // Discount expired - clear discount fields
        updates.hasDiscount = false;
        updates.discountEndDate = null;
        updates.discountStartDate = null;
        updates.discount_percent = null;
        updates.discountType = null;
        needsUpdate = true;
      }
    }

    // Check free delivery expiration
    if (product.free_delivery && product.freeDeliveryEndDate) {
      const freeDeliveryEndDate = new Date(product.freeDeliveryEndDate);
      if (freeDeliveryEndDate < currentDate) {
        // Free delivery expired - clear free delivery fields
        updates.free_delivery = false;
        updates.freeDeliveryEndDate = null;
        updates.freeDeliveryStartDate = null;
        needsUpdate = true;
      }
    }

    // Update product in database if needed
    if (needsUpdate) {
      await product.update(updates);
      console.log(
        `🗑️ Cleaned expired data for product ${product.id} - Discount: ${updates.hasDiscount !== undefined}, Free Delivery: ${updates.free_delivery !== undefined}`,
      );
    }

    updatedProducts.push(product);
  }

  return updatedProducts;
}

/**
 * Check and clean expired discount and free delivery for a single product
 * @param {Object} product - Single product object from database
 * @returns {Promise<Object>} - Product with expired data cleaned
 */
export async function checkAndCleanSingleProduct(product) {
  if (!product) return product;

  const currentDate = new Date();
  let needsUpdate = false;
  const updates = {};

  // Check discount expiration
  if (product.hasDiscount && product.discountEndDate) {
    const discountEndDate = new Date(product.discountEndDate);
    if (discountEndDate < currentDate) {
      updates.hasDiscount = false;
      updates.discountEndDate = null;
      updates.discountStartDate = null;
      updates.discount_percent = null;
      updates.discountType = null;
      needsUpdate = true;
    }
  }

  // Check free delivery expiration
  if (product.free_delivery && product.freeDeliveryEndDate) {
    const freeDeliveryEndDate = new Date(product.freeDeliveryEndDate);
    if (freeDeliveryEndDate < currentDate) {
      updates.free_delivery = false;
      updates.freeDeliveryEndDate = null;
      updates.freeDeliveryStartDate = null;
      needsUpdate = true;
    }
  }

  // Update product in database if needed
  if (needsUpdate) {
    await product.update(updates);
    console.log(
      `🗑️ Cleaned expired data for product ${product.id} - Discount: ${updates.hasDiscount !== undefined}, Free Delivery: ${updates.free_delivery !== undefined}`,
    );
  }

  return product;
}
