/**
 * Parse a legacy/current variant-price value without mutating it or throwing.
 * Sequelize JSON columns normally return arrays, while legacy rows may return
 * JSON strings. A malformed value is intentionally treated as no variants.
 */
export function parseVariantPricesForSeo(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validPositiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function extractPrices(variants) {
  return variants
    .map((variant) => validPositiveNumber(variant?.price))
    .filter((price) => price !== null);
}

function calculateProductSeoPricing(product = {}) {
  // Parse both independently. Never concatenate them: they are localized
  // representations of the same variants, not two separate price catalogs.
  const primaryPrices = extractPrices(
    parseVariantPricesForSeo(product.variantPrices),
  );
  const arabicPrices = extractPrices(
    parseVariantPricesForSeo(product.variantPricesAr),
  );
  const variantPrices = primaryPrices.length ? primaryPrices : arabicPrices;
  const distinctVariantPrices = [...new Set(variantPrices)];
  const realPrice = validPositiveNumber(product.realPrice);
  const currency = ["IQD", "USD"].includes(product.priceType)
    ? product.priceType
    : "IQD";

  return {
    price: realPrice ?? (variantPrices.length ? Math.min(...variantPrices) : 0),
    currency,
    // A range is relevant only when variants are the SEO price source.
    range:
      realPrice === null && distinctVariantPrices.length > 1
        ? {
            lowPrice: Math.min(...distinctVariantPrices),
            highPrice: Math.max(...distinctVariantPrices),
          }
        : null,
  };
}

export function getProductSeoPrice(product) {
  const { price, currency } = calculateProductSeoPricing(product);
  return { price, currency };
}

export function getProductSeoPriceRange(product) {
  return calculateProductSeoPricing(product).range;
}
