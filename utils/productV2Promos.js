import Product from "../database/products.js";
import { Op } from "sequelize";

/**
 * Checks and cleans expired discounts, free delivery, and cashback on products table rows.
 */
export async function checkAndCleanProductExpiration(products) {
  const now = new Date();
  const updates = [];

  for (const product of products) {
    const patch = {};

    // Discount timer expiration
    if (
      product.hasDiscount &&
      product.discountType === "timer" &&
      product.discountEndDate &&
      new Date(product.discountEndDate) < now
    ) {
      patch.hasDiscount = false;
      patch.discount_percent = null;
      patch.discountType = null;
      patch.discountStartDate = null;
      patch.discountEndDate = null;
      product.hasDiscount = false;
      product.discount_percent = null;
      product.discountType = null;
    }

    // Free delivery expiration
    if (
      product.free_delivery &&
      product.freeDeliveryEndDate &&
      new Date(product.freeDeliveryEndDate) < now
    ) {
      patch.free_delivery = false;
      patch.freeDeliveryStartDate = null;
      patch.freeDeliveryEndDate = null;
      product.free_delivery = false;
    }

    // Cashback expiration
    if (
      product.hasCashback &&
      product.cashbackEndDate &&
      new Date(product.cashbackEndDate) < now
    ) {
      patch.hasCashback = false;
      patch.cashbackValue = null;
      patch.cashbackStartDate = null;
      patch.cashbackEndDate = null;
      patch.cashbackMinOrderAmount = null;
      product.hasCashback = false;
      product.cashbackValue = null;
    }

    if (Object.keys(patch).length > 0) {
      if (typeof product.update === "function") {
        updates.push(product.update(patch));
      } else if (product.id) {
        updates.push(Product.update(patch, { where: { id: product.id } }));
      }
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  return products;
}

/**
 * Normalizes a row from the `products` table for consistent frontend display.
 */
export function normalizeProduct(row) {
  const p = row?.toJSON ? row.toJSON() : row;
  if (!p) return p;

  const rawImages = Array.isArray(p.images) ? p.images : [];
  const productImages =
    Array.isArray(p.productImages) && p.productImages.length > 0
      ? p.productImages
      : rawImages.map((img, idx) => ({
          image_key:
            typeof img === "string" ? img : img?.image_key || img?.thumb_key,
          thumb_key:
            typeof img === "string" ? img : img?.thumb_key || img?.image_key,
          is_main: idx === 0,
        }));

  const mainImage = productImages.find((i) => i.is_main) || productImages[0];
  const thumbKey = mainImage?.thumb_key || mainImage?.image_key || null;

  const variantPrices = Array.isArray(p.variantPrices) ? p.variantPrices : [];
  const variantPricesAr = Array.isArray(p.variantPricesAr)
    ? p.variantPricesAr
    : [];
  const hasVariants = variantPrices.length > 0 || variantPricesAr.length > 0;

  return {
    id: p.id,
    seller_id: p.seller_id,
    language: p.language || "both",
    titleKu: p.titleKu || "",
    titleAr: p.titleAr || "",
    descriptionKu: p.descriptionKu || "",
    descriptionAr: p.descriptionAr || "",
    category: p.category || null,
    subcategory: p.subcategory || null,
    category_id: p.category_id || null,
    subcategory_id: p.subcategory_id || null,

    realPrice: Number(p.realPrice) || 0,
    priceType: p.priceType || "USD",
    hasRealPrice: p.hasRealPrice !== false && !hasVariants,

    variantPrices,
    variantPricesAr,
    options: p.options || null,
    variants: p.variants || null,
    colors: p.colors || [],
    sizes: p.sizes || [],
    customInputs: p.customInputs || null,
    customInputsAr: p.customInputsAr || null,

    hasDiscount: !!p.hasDiscount,
    discount_percent: p.hasDiscount ? Number(p.discount_percent) || 0 : 0,
    discountType: p.discountType || "timer",
    discountStartDate: p.discountStartDate || null,
    discountEndDate: p.discountEndDate || null,

    free_delivery: !!p.free_delivery,
    freeDeliveryStartDate: p.freeDeliveryStartDate || null,
    freeDeliveryEndDate: p.freeDeliveryEndDate || null,

    hasCashback: !!p.hasCashback,
    cashbackType: p.cashbackType || "percentage",
    cashbackValue: p.hasCashback ? Number(p.cashbackValue) || 0 : 0,
    cashbackStartDate: p.cashbackStartDate || null,
    cashbackEndDate: p.cashbackEndDate || null,
    cashbackMinOrderAmount: p.cashbackMinOrderAmount || null,

    stock: p.stock ?? null,
    isAvailable: p.isAvailable !== false,
    views: Number(p.views) || 0,
    images: productImages,
    productImages,
    thumb_key: thumbKey,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Backward-compatibility aliases
export const checkAndCleanProductV2Expiration = checkAndCleanProductExpiration;
export const normalizeProductV2 = normalizeProduct;
