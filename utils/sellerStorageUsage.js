/**
 * sellerStorageUsage.js
 *
 * Utilities for scanning and persisting seller storage usage in seller_usage.
 * Used by checkStorageLimit middleware and the seller dashboard route.
 */

import { getR2ObjectSize } from "./r2.js";
import SellerUsage from "../database/sellerUsage.js";
import ProductImage from "../database/productImages.js";
import Product from "../database/products.js";

const BYTES_PER_MB = 1024 * 1024;

/**
 * Get the byte size of an arbitrary R2 asset by its object key.
 * Returns 0 if the key is empty or the object is not found.
 *
 * @param {string} key - R2 object key
 * @returns {Promise<number>} size in bytes
 */
export async function getStoredAssetBytes(key) {
  if (!key) return 0;
  return getR2ObjectSize(key);
}

/**
 * Get the total stored bytes for a ProductImage record.
 * Prefers the stored size_bytes column; falls back to a HEAD request on R2.
 * Also adds the thumbnail size if a thumb_key is present.
 *
 * @param {object} rec - ProductImage instance (or plain object with image_key, thumb_key, size_bytes)
 * @returns {Promise<number>} total bytes (main + thumb)
 */
export async function getProductImageRecordBytes(rec) {
  if (!rec) return 0;

  // Main image
  let mainBytes = 0;
  if (rec.size_bytes != null && rec.size_bytes > 0) {
    mainBytes = Number(rec.size_bytes);
  } else if (rec.image_key) {
    mainBytes = await getStoredAssetBytes(rec.image_key);
  }

  // Thumbnail (usually small – best-effort only)
  const thumbBytes = rec.thumb_key
    ? await getStoredAssetBytes(rec.thumb_key)
    : 0;

  return mainBytes + thumbBytes;
}

/**
 * Ensure the seller_usage row is accurate.
 *
 * When force=false:  returns the cached value from DB if a row already exists.
 * When force=true:   always performs a full scan of the seller's product images
 *                    and color variant images, then upserts seller_usage.
 *
 * For Plus / Business Pro sellers the dashboard calls this with force=true on
 * every load so the displayed value stays current.
 *
 * @param {number} sellerId
 * @param {object|null} plan  - Plan model instance (used for future per-plan logic)
 * @param {object} options    - { force: boolean }
 * @returns {Promise<number>} total storage used in MB
 */
export async function ensureSellerStorageUsage(sellerId, plan, options = {}) {
  const { force = false } = options;

  // Return cached value unless forced
  if (!force) {
    const existing = await SellerUsage.findOne({
      where: { seller_id: sellerId },
    });
    if (existing) {
      return parseFloat(existing.storage_used_mb) || 0;
    }
  }

  // ── Full scan ─────────────────────────────────────────────────────────────

  let totalBytes = 0;

  // 1. Product images — get all product IDs for this seller first, then fetch their images
  const sellerProducts = await Product.findAll({
    where: { seller_id: sellerId },
    attributes: ["id"],
  });
  const productIds = sellerProducts.map((p) => p.id);

  const imageRecords =
    productIds.length > 0
      ? await ProductImage.findAll({
          where: { product_id: productIds },
          attributes: ["image_key", "thumb_key", "size_bytes"],
        })
      : [];

  for (const rec of imageRecords) {
    totalBytes += await getProductImageRecordBytes(rec);
  }

  // 2. Color variant images stored inside products.colors JSON
  const allProducts = await Product.findAll({
    where: { seller_id: sellerId },
    attributes: ["colors"],
  });

  for (const product of allProducts) {
    const colorImages = (product.colors || []).filter((c) => c.imageKey);
    for (const ci of colorImages) {
      const bytes =
        Number(ci.imageSizeBytes || 0) ||
        (ci.imageKey ? await getStoredAssetBytes(ci.imageKey) : 0);
      totalBytes += bytes;
    }
  }

  const totalMb = totalBytes / BYTES_PER_MB;

  // Upsert the seller_usage row
  await SellerUsage.upsert({
    seller_id: sellerId,
    storage_used_mb: totalMb,
  });

  return totalMb;
}
