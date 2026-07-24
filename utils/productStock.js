// utils/productStock.js
//
// Handles server-side inventory decrement when an order is placed.
// A product can track stock in two ways:
//   1. Top-level `stock` column - used when the product has no variants,
//      or the ordered variant doesn't carry its own stock value.
//   2. Per-variant `stock` key inside `variantPrices` (Kurdish) /
//      `variantPricesAr` (Arabic) - used when a specific option combination
//      (color/size/taste/etc.) tracks its own stock.
//
// Rule: if the relevant stock value is 0 AND the product's `isAvailable`
// flag is true, that combination is treated as "unlimited / not tracked",
// so the decrement is skipped. Otherwise stock is decremented by the
// ordered quantity, floored at 0.

const EXCLUDED_VARIANT_KEYS = ["price", "stock"];

/**
 * Build a comparable signature from a variant's option keys/values,
 * ignoring price/stock, so it can be matched against an order item's
 * selected_options.
 */
export function variantSignature(variantObj) {
  if (!variantObj || typeof variantObj !== "object") return "";

  return Object.keys(variantObj)
    .filter((key) => !EXCLUDED_VARIANT_KEYS.includes(key))
    .sort()
    .map((key) => `${key}:${String(variantObj[key]).trim()}`)
    .join("|");
}

/**
 * Find the index of the variant inside `variantList` that matches the
 * order item's selected options. Returns -1 if not found or not applicable
 * (e.g. the item has no selected_options, meaning it's a plain product).
 */
export function findMatchingVariantIndex(variantList, selectedOptions) {
  if (!Array.isArray(variantList) || !variantList.length) return -1;
  if (!selectedOptions || typeof selectedOptions !== "object") return -1;

  const targetSignature = variantSignature(selectedOptions);
  if (!targetSignature) return -1;

  return variantList.findIndex(
    (variant) => variantSignature(variant) === targetSignature,
  );
}

/**
 * Compute the next stock value after ordering `quantity` units.
 * Returns null when the decrement should be skipped (unlimited/untracked stock).
 */
export function computeNextStock(currentStock, quantity, isAvailable) {
  const stock = Number(currentStock) || 0;
  const qty = Math.max(0, Math.floor(Number(quantity)) || 0);

  // Untracked / unlimited stock: product is marked available with 0 stock on record.
  if (stock === 0 && isAvailable === true) {
    return null;
  }

  return Math.max(0, stock - qty);
}

/**
 * Work out what needs to change on a product row for a single ordered item.
 * Returns an object with the fields to persist via `product.update(...)`,
 * or null if nothing should change.
 *
 * `product` should have: stock, isAvailable, variantPrices, variantPricesAr
 * `item` should have: quantity, selected_options (may be null/undefined)
 */
export function applyItemStockDecrement(product, item) {
  if (!product) return null;

  const variantPrices = Array.isArray(product.variantPrices)
    ? [...product.variantPrices]
    : null;
  const variantPricesAr = Array.isArray(product.variantPricesAr)
    ? [...product.variantPricesAr]
    : null;

  const variantIndex = variantPrices
    ? findMatchingVariantIndex(variantPrices, item.selected_options)
    : -1;

  const matchedVariant =
    variantIndex !== -1 ? variantPrices[variantIndex] : null;
  const variantHasOwnStock =
    matchedVariant &&
    Object.prototype.hasOwnProperty.call(matchedVariant, "stock");

  const update = {};

  if (variantHasOwnStock) {
    // Per-variant stock tracking.
    const nextStock = computeNextStock(
      matchedVariant.stock,
      item.quantity,
      product.isAvailable,
    );

    if (nextStock === null) return null;

    variantPrices[variantIndex] = { ...matchedVariant, stock: nextStock };
    update.variantPrices = variantPrices;

    // Keep the Arabic mirror array in sync at the same index, if it exists.
    if (variantPricesAr && variantPricesAr[variantIndex]) {
      variantPricesAr[variantIndex] = {
        ...variantPricesAr[variantIndex],
        stock: nextStock,
      };
      update.variantPricesAr = variantPricesAr;
    }

    return update;
  }

  // Fall back to top-level product stock (no variant selected, or the
  // selected variant doesn't carry its own stock value).
  const nextStock = computeNextStock(
    product.stock,
    item.quantity,
    product.isAvailable,
  );

  if (nextStock === null) return null;

  update.stock = nextStock;
  return update;
}


