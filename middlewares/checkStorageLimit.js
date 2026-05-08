/**
 * checkStorageLimit middleware
 *
 * Must run AFTER r2Multer (files are in memory as req.files / req.file).
 * Reads the total size of incoming files, compares it against the seller's
 * plan limit and current usage, and rejects the request if the limit is exceeded.
 *
 * Attaches req.uploadSizeBytes to pass the total incoming size downstream.
 */

import SellerPlan from "../database/sellerPlan.js";
import Plan from "../database/plan.js";
import SellerUsage from "../database/sellerUsage.js";
import { ensureSellerStorageUsage } from "../utils/sellerStorageUsage.js";

const BYTES_PER_MB = 1024 * 1024;

export async function checkStorageLimit(req, res, next) {
  try {
    const sellerId = req.user?.id;
    if (!sellerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Collect all incoming file buffers (handles multer .array() and .fields())
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else {
        // multer .fields() returns an object of arrays
        Object.values(req.files).forEach((arr) => files.push(...arr));
      }
    }

    // No files → nothing to check
    if (files.length === 0) {
      req.uploadSizeBytes = 0;
      return next();
    }

    const incomingBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

    // Get seller plan
    const sellerPlan = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlan) {
      return res.status(403).json({
        success: false,
        error: true,
        message: "No active plan found for this seller",
      });
    }

    const plan = await Plan.findByPk(sellerPlan.plan_id);
    if (!plan) {
      return res.status(403).json({
        success: false,
        error: true,
        message: "Plan details not found",
      });
    }

    const limitMb = parseFloat(plan.storage_limit_mb) || 500;

    const usedMb = await ensureSellerStorageUsage(sellerId, plan, {
      force: true,
    });
    const incomingMb = incomingBytes / BYTES_PER_MB;

    if (usedMb + incomingMb > limitMb) {
      return res.status(413).json({
        success: false,
        error: true,
        storage_limit_exceeded: true,
        message: `Storage limit exceeded. Used: ${usedMb.toFixed(2)} MB / ${limitMb} MB. Incoming: ${incomingMb.toFixed(2)} MB.`,
      });
    }

    // Pass the size downstream so the route can update usage after upload
    req.uploadSizeBytes = incomingBytes;
    next();
  } catch (err) {
    console.error("checkStorageLimit error:", err);
    res.status(500).json({ success: false, message: "Storage check failed" });
  }
}

/**
 * Increment seller_usage.storage_used_mb by the given byte count.
 * @param {number} sellerId
 * @param {number} addedBytes
 */
export async function incrementSellerStorage(sellerId, addedBytes) {
  if (!sellerId || !addedBytes) return;
  const [record] = await SellerUsage.findOrCreate({
    where: { seller_id: sellerId },
    defaults: { storage_used_mb: 0 },
  });
  const addedMb = addedBytes / BYTES_PER_MB;
  await record.update({
    storage_used_mb: parseFloat(record.storage_used_mb) + addedMb,
  });
}

/**
 * Decrement seller_usage.storage_used_mb by the given byte count.
 * Clamps to 0 to avoid negative values.
 * @param {number} sellerId
 * @param {number} removedBytes
 */
export async function decrementSellerStorage(sellerId, removedBytes) {
  if (!sellerId || !removedBytes) return;
  const record = await SellerUsage.findOne({
    where: { seller_id: sellerId },
  });
  if (!record) return;
  const removedMb = removedBytes / BYTES_PER_MB;
  const newMb = Math.max(0, parseFloat(record.storage_used_mb) - removedMb);
  await record.update({ storage_used_mb: newMb });
}
