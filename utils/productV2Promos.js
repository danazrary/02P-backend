// backend/utils/productV2Promos.js
//
// Helpers for ProductV2's JSON promo bundles (discount, cashback,
// free_delivery). Each bundle shares the same shape:
//   {
//     is_active: boolean,
//     mode: "running" | "timer",   // "running" = active until manually
//                                   // stopped, "timer" = has an end_at
//     start_at: string|null,
//     end_at: string|null,
//     ...bundle-specific fields (type/value for discount,
//        value_type/value/currency for cashback)
//   }
//
// A "running" bundle never auto-expires — only a "timer" bundle with a
// past end_at is considered expired.

/**
 * Returns true if a promo bundle is currently within its active window.
 * A null/missing bundle, or one with is_active !== true, is never active.
 */
export function isPromoCurrentlyActive(bundle, now = new Date()) {
  if (!bundle || bundle.is_active !== true) return false;

  if (bundle.start_at) {
    const start = new Date(bundle.start_at);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }

  if (bundle.mode === "timer") {
    if (!bundle.end_at) return false; // timer mode requires an end date
    const end = new Date(bundle.end_at);
    if (Number.isNaN(end.getTime())) return false;
    return now <= end;
  }

  // mode === "running" (or unspecified, treated as running): active
  // indefinitely once started, regardless of end_at.
  return true;
}

/**
 * Returns true if a "timer" mode bundle's end_at has passed, meaning it
 * should be cleared (is_active flipped false) on the next write. Running
 * bundles are never expired this way — they only stop when the seller
 * deactivates them.
 */
export function isPromoExpired(bundle, now = new Date()) {
  if (!bundle || bundle.is_active !== true) return false;
  if (bundle.mode !== "timer") return false;
  if (!bundle.end_at) return false;
  const end = new Date(bundle.end_at);
  if (Number.isNaN(end.getTime())) return false;
  return now > end;
}

/**
 * Given an array of ProductV2 instances (or plain objects with .discount /
 * .cashback / .free_delivery), finds any whose "timer" bundles have
 * expired, clears is_active on those bundles in the DB, and returns the
 * same array with in-memory bundles updated to match — so callers always
 * see accurate, already-expired-cleared data without a second read.
 */
export async function checkAndCleanProductV2Expiration(products) {
  const now = new Date();
  const updates = [];

  for (const product of products) {
    const patch = {};

    for (const field of ["discount", "cashback", "free_delivery"]) {
      const bundle = product[field];
      if (isPromoExpired(bundle, now)) {
        const cleared = { ...bundle, is_active: false };
        patch[field] = cleared;
        product[field] = cleared; // keep in-memory row in sync
      }
    }

    if (Object.keys(patch).length > 0) {
      updates.push(product.update ? product.update(patch) : Promise.resolve());
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  return products;
}

/**
 * Maps a ProductV2 row (with its productImages include) into the flat
 * shape the frontend (ProductCard.jsx, cart flow, etc.) expects. Fields
 * that no longer exist on ProductV2 (variant pricing, per-language price
 * overrides, custom badges baked into the product itself) are omitted —
 * those are handled elsewhere (seller-level product_badges) or don't
 * apply to the new schema.
 */
export function normalizeProductV2(row, { lang = "ku" } = {}) {
  const p = row?.toJSON ? row.toJSON() : row;
  if (!p) return p;

  const title = p.title || {};
  const titleKu = title.ku || "";
  const titleAr = title.ar || "";

  const discount = p.discount || null;
  const cashback = p.cashback || null;
  const freeDelivery = p.free_delivery || null;

  const discountActive = isPromoCurrentlyActive(discount);
  const cashbackActive = isPromoCurrentlyActive(cashback);
  const freeDeliveryActive = isPromoCurrentlyActive(freeDelivery);

  const retailPrice = Number(p.retail_price) || 0;
  const discountPercent =
    discountActive && discount?.type === "percent"
      ? Number(discount.value) || 0
      : 0;
  const discountFixed =
    discountActive && discount?.type === "fixed"
      ? Number(discount.value) || 0
      : 0;

  const images = Array.isArray(p.images) ? p.images : [];
  const productImages = Array.isArray(p.productImages)
    ? p.productImages
    : images.map((url, idx) => ({
        image_key: url,
        thumb_key: url,
        is_main: idx === 0,
      }));

  const isWholesaleOnly = !!p.is_wholesale_only;
  const stock = Number.isFinite(Number(p.stock_quantity))
    ? Number(p.stock_quantity)
    : 0;
  // Wholesale-only items aren't tracked by unit stock the same way —
  // don't treat stock 0 as "out of stock" for them.
  const isAvailable =
    p.is_published !== false && (isWholesaleOnly || stock > 0);

  const variantR = Array.isArray(p.variant_r) ? p.variant_r : [];
  const variantRAr = Array.isArray(p.variant_r_ar) ? p.variant_r_ar : [];
  const hasVariantPrices = variantR.length > 0 || variantRAr.length > 0;

  return {
    id: p.id,
    seller_id: p.seller_id,
    titleKu,
    titleAr,
    language: p.language || "both",
    description: p.description || null,
    custom_inputs: p.custom_inputs || null,
    barcode: p.barcode || null,
    sku: p.sku || null,
    category: p.category || null,
    subcategory: p.subcategory || null,

    hasRealPrice: !hasVariantPrices,
    realPrice: retailPrice,
    priceType: p.price_type || "iqd",

    // ڤاریانتەکانی تاک‌فرۆشی — بە زمانی کوردی و عەرەبی
    variantPrices: variantR,
    variantPricesAr: variantRAr,

    // ڤاریانتەکانی جوملە (وەسفی دەقی + مەودای بڕ)
    variant_w: Array.isArray(p.variant_w) ? p.variant_w : [],

    video_links: Array.isArray(p.video_links) ? p.video_links : [],
    views: Number.isFinite(Number(p.views)) ? Number(p.views) : 0,

    hasDiscount: discountActive && (discountPercent > 0 || discountFixed > 0),
    discount_percent: discountPercent,
    discount_fixed: discountFixed,
    discountType: discount?.mode === "timer" ? "timer" : "running",
    discountStartDate: discount?.start_at || null,
    discountEndDate: discount?.end_at || null,

    free_delivery: freeDeliveryActive,
    freeDeliveryStartDate: freeDelivery?.start_at || null,
    freeDeliveryEndDate: freeDelivery?.end_at || null,

    hasCashback: cashbackActive,
    cashbackType: cashback?.value_type || null,
    cashbackValue: cashbackActive ? Number(cashback?.value) || 0 : 0,
    cashbackCurrency: cashback?.currency || null,

    images: productImages,
    productImages,

    stock: isWholesaleOnly ? null : stock,
    isAvailable,
    is_wholesale_only: isWholesaleOnly,
    wholesale_price:
      p.wholesale_price != null ? Number(p.wholesale_price) : null,
    min_wholesale_quantity: p.min_wholesale_quantity || 1,
    wholesale_tier_pricing: p.wholesale_tier_pricing || null,

    extra_attributes: p.extra_attributes || null,
    sort_order: p.sort_order || 0,
  };
}
