import express from "express";
import { v4 as uuidv4 } from "uuid";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import Seller from "../../database/sellerv2.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { uploadRateLimiter } from "../../middlewares/rateLimitReq.js";
import {
  checkStorageLimit,
  incrementSellerStorage,
  decrementSellerStorage,
} from "../../middlewares/checkStorageLimit.js";
import {
  createR2Multer,
  buildR2Key,
  uploadToR2,
  uploadColorImageToR2,
  uploadToR2WithThumb,
  deleteFromR2,
  deleteMultipleFromR2,
  isLocalEnv,
} from "../../utils/r2.js";
import getTikTokEmbedUrl, {
  isTikTokUrlCandidate,
} from "../../utils/getTikTokEmbedUrl.js";
import { getProductImageRecordBytes } from "../../utils/sellerStorageUsage.js";
import { notifyGoogle } from "../../utils/googleIndexing.js";
import { parseOptionalCashbackDate } from "../../utils/cashbackDates.js";
import {
  canAddProduct,
  canEditProduct,
  canDeleteProduct,
} from "../../middlewares/staffPermissions.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "dwkanlink.com";

function productUrl(shopName, productId) {
  return `https://${shopName}.${BASE_DOMAIN}/p/${productId}`;
}

const router = express.Router();

// Older middlewares (storage limit, rate limiter) may read req.user.id as the shop id.
// Staff tokens do not carry it, so after the permission guard passed we expose the
// verified shop id there. Remove once those middlewares use req.actor.sellerId.
function exposeShopIdToLegacyMiddleware(req, res, next) {
  req.user = { ...req.user, id: req.actor.sellerId };
  next();
}
const MAX_COLOR_IMAGE_FIELDS = 15;
const MAX_OPTION_IMAGE_FIELDS = 15;
const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
const ADVANCED_PLAN_ALIASES = new Set([
  "large seller",
  "plus",
  "plus plan",
  "business",
  "business pro",
  "business pro plan",
]);
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const productUploadMiddleware = createR2Multer({
  fileSize: MAX_PRODUCT_IMAGE_BYTES,
  files: 20,
}).fields([
  { name: "images", maxCount: 5 },
  ...Array.from({ length: MAX_COLOR_IMAGE_FIELDS }, (_, index) => ({
    name: `colorImage_${index}`,
    maxCount: 1,
  })),
  ...Array.from({ length: MAX_OPTION_IMAGE_FIELDS }, (_, index) => ({
    name: `optionImage_${index}`,
    maxCount: 1,
  })),
]);

function productUpload(req, res, next) {
  productUploadMiddleware(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        success: false,
        error: true,
        message:
          "Each product image must be 2MB or smaller after frontend compression.",
      });
      return;
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({
        success: false,
        error: true,
        message: "You can upload up to 20 product images per request.",
      });
      return;
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({
        success: false,
        error: true,
        message: "Unexpected product image field in upload request.",
      });
      return;
    }

    next(err);
  });
}

function normalizeVariantOptionValue(value) {
  if (typeof value === "string") {
    const v = value.trim();
    return v || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

const RESERVED_VARIANT_KEYS = new Set(["price", "stock", "options"]);

function extractDynamicVariantOptions(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return {};

  const dynamicOptions = {};

  const optionsObject =
    row.options &&
    typeof row.options === "object" &&
    !Array.isArray(row.options)
      ? row.options
      : null;

  if (optionsObject) {
    Object.entries(optionsObject).forEach(([rawKey, rawVal]) => {
      const key = typeof rawKey === "string" ? rawKey.trim() : "";
      if (!key) return;
      const normalizedVal = normalizeVariantOptionValue(rawVal);
      if (normalizedVal == null) return;
      dynamicOptions[key] = normalizedVal;
    });
    return dynamicOptions;
  }

  Object.entries(row).forEach(([rawKey, rawVal]) => {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key || RESERVED_VARIANT_KEYS.has(key)) return;
    const normalizedVal = normalizeVariantOptionValue(rawVal);
    if (normalizedVal == null) return;
    dynamicOptions[key] = normalizedVal;
  });

  return dynamicOptions;
}

function normalizeVariantPriceRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];

  return rawRows
    .map((row) => {
      const parsedPrice = Number(row?.price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return null;

      const dynamicOptions = extractDynamicVariantOptions(row);
      if (Object.keys(dynamicOptions).length === 0) return null;

      const out = {
        ...dynamicOptions,
        price: parsedPrice,
      };

      if (
        row?.stock !== undefined &&
        row?.stock !== null &&
        row?.stock !== ""
      ) {
        const parsedStock = Number(row.stock);
        if (Number.isInteger(parsedStock) && parsedStock >= 0) {
          out.stock = parsedStock;
        }
      }

      return out;
    })
    .filter(Boolean);
}

function pickProvidedLangs(input = {}) {
  const out = {};
  ["ku", "ar", "en"].forEach((lang) => {
    const val = typeof input?.[lang] === "string" ? input[lang].trim() : "";
    if (val) out[lang] = val;
  });
  return out;
}

function normalizeOptionsPayload(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];

  return rawOptions
    .map((group, groupIndex) => {
      const title = pickProvidedLangs(group?.title || {});
      const rawValues = Array.isArray(group?.options)
        ? group.options
        : Array.isArray(group?.values)
          ? group.values
          : [];

      const options = rawValues
        .map((value) => {
          const text = pickProvidedLangs(value?.text || value?.title || {});
          if (Object.keys(text).length === 0) return null;

          const normalized = { text };
          if (
            groupIndex === 0 &&
            typeof value?.image === "string" &&
            value.image.trim()
          ) {
            normalized.image = value.image.trim();
          }
          return normalized;
        })
        .filter(Boolean);

      if (Object.keys(title).length === 0 || options.length === 0) {
        return null;
      }

      return { title, options };
    })
    .filter(Boolean);
}

function parseOptionsInput(rawValue) {
  if (rawValue === undefined) {
    return { provided: false, rows: [] };
  }

  let parsedRaw;
  try {
    parsedRaw = JSON.parse(rawValue);
  } catch {
    const err = new Error("Invalid options JSON");
    err.statusCode = 400;
    err.clientMessage = "options must be a valid JSON array.";
    throw err;
  }

  if (!Array.isArray(parsedRaw)) {
    const err = new Error("Invalid options format");
    err.statusCode = 400;
    err.clientMessage = "options must be an array.";
    throw err;
  }

  const rows = normalizeOptionsPayload(parsedRaw);
  if (rows.length === 0) {
    const err = new Error("options is empty after normalization");
    err.statusCode = 400;
    err.clientMessage = "options must include at least one valid option group.";
    throw err;
  }

  return { provided: true, rows };
}

function normalizeToComparableText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function buildArabicVariantPricesFromOptions(variantPrices, options) {
  if (!Array.isArray(variantPrices) || variantPrices.length === 0) return [];
  const groups = Array.isArray(options) ? options : [];

  return variantPrices.map((variant) => {
    const sourceOptions = extractDynamicVariantOptions(variant);
    const translatedOptions = {};

    Object.entries(sourceOptions).forEach(([rawKey, rawValue]) => {
      const keyText = normalizeToComparableText(rawKey);
      const valueText = normalizeToComparableText(rawValue);
      if (!keyText || !valueText) return;

      const matchedGroup = groups.find((group) => {
        const title = group?.title || {};
        return [title.ku, title.ar, title.en]
          .map((v) => normalizeToComparableText(v))
          .includes(keyText);
      });

      const outputKey =
        normalizeToComparableText(matchedGroup?.title?.ar) ||
        normalizeToComparableText(matchedGroup?.title?.ku) ||
        keyText;

      let outputValue = valueText;
      if (matchedGroup && Array.isArray(matchedGroup.options)) {
        const matchedValue = matchedGroup.options.find((optValue) => {
          const text = optValue?.text || {};
          return [text.ku, text.ar, text.en]
            .map((v) => normalizeToComparableText(v))
            .includes(valueText);
        });

        outputValue =
          normalizeToComparableText(matchedValue?.text?.ar) ||
          normalizeToComparableText(matchedValue?.text?.ku) ||
          valueText;
      }

      translatedOptions[outputKey] = outputValue;
    });

    const translatedVariant = {
      ...translatedOptions,
      price: Number(variant?.price),
    };

    if (
      variant?.stock !== undefined &&
      variant?.stock !== null &&
      variant?.stock !== ""
    ) {
      const parsedStock = Number(variant.stock);
      if (Number.isInteger(parsedStock) && parsedStock >= 0) {
        translatedVariant.stock = parsedStock;
      }
    }

    return translatedVariant;
  });
}

function parseVariantPricesInput(rawValue, fieldName) {
  if (rawValue === undefined) {
    return { provided: false, rows: [] };
  }

  let parsedRaw;
  try {
    parsedRaw = JSON.parse(rawValue);
  } catch {
    const err = new Error(`Invalid ${fieldName} JSON`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be a valid JSON array.`;
    throw err;
  }

  if (!Array.isArray(parsedRaw)) {
    const err = new Error(`Invalid ${fieldName} format`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be an array.`;
    throw err;
  }

  const rows = normalizeVariantPriceRows(parsedRaw);
  if (rows.length === 0) {
    const err = new Error(`${fieldName} is empty after normalization`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must include at least one valid variant with dynamic keys and price.`;
    throw err;
  }

  return { provided: true, rows };
}

async function normalizeVideoLinks(videoLinks) {
  const normalizedLinks = [];

  for (let index = 0; index < videoLinks.length; index += 1) {
    const currentLink =
      typeof videoLinks[index] === "string" ? videoLinks[index].trim() : "";

    if (!currentLink) {
      normalizedLinks.push("");
      continue;
    }

    if (!isTikTokUrlCandidate(currentLink)) {
      normalizedLinks.push(currentLink);
      continue;
    }

    const embedUrl = await getTikTokEmbedUrl(currentLink);
    if (!embedUrl) {
      const invalidTikTokError = new Error(
        `Invalid TikTok URL at index ${index}`,
      );
      invalidTikTokError.statusCode = 400;
      invalidTikTokError.clientMessage = `Invalid TikTok URL provided for video link ${index + 1}`;
      throw invalidTikTokError;
    }

    normalizedLinks.push(embedUrl);
  }

  return normalizedLinks;
}

function parseBooleanInput(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseOptionalDecimal(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be a valid number.`;
    throw err;
  }
  return parsed;
}

function normalizeCashbackPayload(body = {}) {
  const hasCashback = parseBooleanInput(body.hasCashback);

  if (!hasCashback) {
    return {
      hasCashback: false,
      cashbackType: "percentage",
      cashbackValue: null,
      cashbackStartDate: null,
      cashbackEndDate: null,
      cashbackMinOrderAmount: null,
    };
  }

  const cashbackType = body.cashbackType || "percentage";
  if (!["percentage", "fixed"].includes(cashbackType)) {
    const err = new Error("Invalid cashbackType");
    err.statusCode = 400;
    err.clientMessage = "cashbackType must be percentage or fixed.";
    throw err;
  }

  const cashbackValue = parseOptionalDecimal(
    body.cashbackValue,
    "cashbackValue",
  );
  if (cashbackValue === null) {
    const err = new Error("Missing cashbackValue");
    err.statusCode = 400;
    err.clientMessage = "cashbackValue is required when cashback is enabled.";
    throw err;
  }
  if (
    cashbackType === "percentage" &&
    (cashbackValue < 1 || cashbackValue > 100)
  ) {
    const err = new Error("Invalid cashback percentage");
    err.statusCode = 400;
    err.clientMessage = "Percentage cashback must be between 1 and 100.";
    throw err;
  }
  if (cashbackType === "fixed" && cashbackValue <= 0) {
    const err = new Error("Invalid fixed cashback");
    err.statusCode = 400;
    err.clientMessage = "Fixed cashback must be positive.";
    throw err;
  }

  const cashbackStartDate = parseOptionalCashbackDate(
    body.cashbackStartDate,
    "cashbackStartDate",
  );
  const cashbackEndDate = parseOptionalCashbackDate(
    body.cashbackEndDate,
    "cashbackEndDate",
  );
  if (
    cashbackStartDate &&
    cashbackEndDate &&
    cashbackEndDate.getTime() <= cashbackStartDate.getTime()
  ) {
    const err = new Error("Invalid cashback date range");
    err.statusCode = 400;
    err.clientMessage = "cashbackEndDate must be after cashbackStartDate.";
    throw err;
  }

  const cashbackMinOrderAmount = parseOptionalDecimal(
    body.cashbackMinOrderAmount,
    "cashbackMinOrderAmount",
  );
  if (cashbackMinOrderAmount !== null && cashbackMinOrderAmount < 0) {
    const err = new Error("Invalid cashbackMinOrderAmount");
    err.statusCode = 400;
    err.clientMessage = "cashbackMinOrderAmount must be zero or greater.";
    throw err;
  }

  return {
    hasCashback: true,
    cashbackType,
    cashbackValue,
    cashbackStartDate,
    cashbackEndDate,
    cashbackMinOrderAmount,
  };
}

function normalizePlanValue(planName) {
  return String(planName || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isFreeSellerPlan(plan) {
  const normalizedPlan = normalizePlanValue(plan?.name);
  return (
    plan?.id === 1 ||
    plan?.id === 30 ||
    plan?.max_products === 15 ||
    normalizedPlan === "free" ||
    normalizedPlan === "free seller"
  );
}

function getProductFieldLimit(plan) {
  if (isFreeSellerPlan(plan)) {
    return 2;
  }

  const normalizedPlan = normalizePlanValue(plan?.name);
  const compactPlan = normalizedPlan.replace(/\s+/g, "");
  const isAdvancedPlan =
    ADVANCED_PLAN_ALIASES.has(normalizedPlan) ||
    compactPlan === "businesspro" ||
    (plan?.max_products ?? 0) >= 500;

  return isAdvancedPlan ? 15 : 5;
}

function getMaxVariantPriceCombinations(plan) {
  return getProductFieldLimit(plan) === 15 ? 225 : 125;
}

function validateVariantPriceCombinations(plan, variantPrices) {
  const maxCombos = getMaxVariantPriceCombinations(plan);
  if (variantPrices.length > maxCombos) {
    const err = new Error("Variant price combination limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${maxCombos} price combinations.`;
    throw err;
  }
}

function getProductImageLimits(plan) {
  if (isFreeSellerPlan(plan)) {
    return {
      mainImages: 3,
      colorImages: 0,
      totalImages: 3,
      maxOptionsValues: 5,
    };
  }

  const colorImages = getProductFieldLimit(plan);

  return {
    mainImages: 5,
    colorImages,
    totalImages: colorImages + 5,
    maxOptionsValues: 0,
  };
}

function countUploadedColorImages(files = {}) {
  return Object.entries(files)
    .filter(([fieldName]) => fieldName.startsWith("colorImage_"))
    .reduce((sum, [, fieldFiles]) => sum + fieldFiles.length, 0);
}

function getUploadedColorImageIndexes(files = {}) {
  return Object.keys(files)
    .filter((fieldName) => fieldName.startsWith("colorImage_"))
    .map((fieldName) => Number(fieldName.replace("colorImage_", "")))
    .filter((index) => Number.isInteger(index));
}

function validateProductImageUploadLimits({
  plan,
  files,
  colorCount,
  existingMainImages = 0,
  existingColorImages = 0,
}) {
  const limits = getProductImageLimits(plan);
  const mainImages = files?.images?.length || 0;
  const colorImages = countUploadedColorImages(files);
  const totalImages = mainImages + colorImages;

  if (mainImages > limits.mainImages) {
    const err = new Error("Main image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.mainImages} main product images.`;
    throw err;
  }

  if (colorImages > limits.colorImages) {
    const err = new Error("Color image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.colorImages} color images.`;
    throw err;
  }

  if (totalImages > limits.totalImages) {
    const err = new Error("Total image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.totalImages} product images in total.`;
    throw err;
  }

  if (existingMainImages + mainImages > limits.mainImages) {
    const err = new Error("Final main image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.mainImages} main product images.`;
    throw err;
  }

  if (existingColorImages + colorImages > limits.colorImages) {
    const err = new Error("Final color image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.colorImages} color images.`;
    throw err;
  }

  if (
    existingMainImages + existingColorImages + totalImages >
    limits.totalImages
  ) {
    const err = new Error("Final total image limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${limits.totalImages} product images in total.`;
    throw err;
  }

  const uploadedIndexes = getUploadedColorImageIndexes(files);
  if (uploadedIndexes.some((index) => index < 0 || index >= colorCount)) {
    const err = new Error("Unexpected color image field");
    err.statusCode = 400;
    err.clientMessage =
      "Uploaded color images must match the submitted product colors.";
    throw err;
  }

  return limits;
}

function normalizeColorSegment(value) {
  return (
    String(value || "color")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "color"
  );
}

function toPublicR2Url(key) {
  if (!key) return null;
  if (!R2_PUBLIC_URL) return key;
  return `${R2_PUBLIC_URL}/${key}`;
}

function getUploadedOptionImageIndexes(files = {}) {
  return Object.keys(files)
    .filter((fieldName) => fieldName.startsWith("optionImage_"))
    .map((fieldName) => Number(fieldName.replace("optionImage_", "")))
    .filter((index) => Number.isInteger(index));
}

function cloneOptionsPayload(options = []) {
  return Array.isArray(options) ? JSON.parse(JSON.stringify(options)) : [];
}

function validateUploadedOptionImageIndexes({ files, options }) {
  const uploadedIndexes = getUploadedOptionImageIndexes(files);
  if (uploadedIndexes.length === 0) return;

  const firstGroupValuesCount = Array.isArray(options?.[0]?.options)
    ? options[0].options.length
    : 0;

  if (
    uploadedIndexes.some((index) => index < 0 || index >= firstGroupValuesCount)
  ) {
    const err = new Error("Unexpected option image field");
    err.statusCode = 400;
    err.clientMessage =
      "Uploaded option images must match values in the first option group.";
    throw err;
  }
}

async function uploadFirstOptionGroupImagesToR2({
  sellerId,
  productId,
  options,
  files,
}) {
  const nextOptions = cloneOptionsPayload(options);
  const firstGroupValues = Array.isArray(nextOptions?.[0]?.options)
    ? nextOptions[0].options
    : [];

  if (firstGroupValues.length === 0) {
    return { options: nextOptions, uploadedBytes: 0, changed: false };
  }

  let uploadedBytes = 0;
  let changed = false;

  for (
    let valueIndex = 0;
    valueIndex < firstGroupValues.length;
    valueIndex += 1
  ) {
    const optionFile = files?.[`optionImage_${valueIndex}`]?.[0];
    if (!optionFile) continue;

    const valueText =
      firstGroupValues[valueIndex]?.text?.ku ||
      firstGroupValues[valueIndex]?.text?.ar ||
      String(valueIndex + 1);
    const optionSegment = normalizeColorSegment(valueText);
    const key = `shops/${sellerId}/products/${productId}/colors/${optionSegment}-${uuidv4()}.webp`;

    const { sizeBytes } = await uploadColorImageToR2(optionFile.buffer, key);
    uploadedBytes += sizeBytes;
    firstGroupValues[valueIndex].image = toPublicR2Url(key);
    changed = true;
  }

  return { options: nextOptions, uploadedBytes, changed };
}

function validateProductFieldLimits({
  plan,
  colors,
  sizes,
  customInputs,
  customInputsAr,
}) {
  const fieldLimit = getProductFieldLimit(plan);
  const counts = [
    { label: "colors", count: colors.length },
    { label: "sizes", count: sizes.length },
    { label: "custom fields", count: customInputs.length },
    { label: "custom fields", count: customInputsAr.length },
  ];

  const exceededField = counts.find(({ count }) => count > fieldLimit);

  if (!exceededField) {
    return fieldLimit;
  }

  const planLimitError = new Error(
    `Plan field limit exceeded for ${exceededField.label}`,
  );
  planLimitError.statusCode = 400;
  planLimitError.clientMessage = `Your current seller plan allows up to ${fieldLimit} colors, ${fieldLimit} sizes, and ${fieldLimit} custom fields per product.`;
  throw planLimitError;
}

function validateProductOptionsLimits(plan, options = []) {
  const fieldLimit = getProductFieldLimit(plan);
  const imageLimits = getProductImageLimits(plan);
  const optionGroups = Array.isArray(options) ? options : [];

  if (optionGroups.length > fieldLimit) {
    const err = new Error("Option group limit exceeded");
    err.statusCode = 400;
    err.clientMessage = `Your current seller plan allows up to ${fieldLimit} product options.`;
    throw err;
  }

  if (imageLimits.maxOptionsValues > 0) {
    const exceededGroup = optionGroups.find(
      (group) =>
        Array.isArray(group?.options) &&
        group.options.length > imageLimits.maxOptionsValues,
    );

    if (exceededGroup) {
      const err = new Error("Option values limit exceeded");
      err.statusCode = 400;
      err.clientMessage = `Your current seller plan allows up to ${imageLimits.maxOptionsValues} values for each product option.`;
      throw err;
    }
  }
}

// POST /add-product
router.post(
  "/add-product",
  canAddProduct,
  exposeShopIdToLegacyMiddleware,
  uploadRateLimiter,
  productUpload,
  checkStorageLimit,
  async (req, res) => {
    try {
      const tRequest = Date.now();
      const id = req.actor.sellerId;

      const sellerPlan = await SellerPlan.findOne({
        where: { seller_id: id },
      });

      if (!sellerPlan) {
        return res.status(403).json({
          success: false,
          error: true,
          message: "No plan found for this seller",
        });
      }

      const plan = await Plan.findByPk(sellerPlan.plan_id);

      if (
        sellerPlan.plan_id === 1 ||
        plan?.name === "free_seller" ||
        plan?.name === "Free"
      ) {
        return res.status(403).json({
          success: false,
          error: true,
          free_plan: true,
          message: "Free plan cannot add products. Please upgrade your plan.",
        });
      }

      const maxProducts = plan ? plan.max_products : 0;

      const currentProductCount = await Product.count({
        where: { seller_id: id },
      });

      if (currentProductCount >= maxProducts) {
        return res.status(403).json({
          success: false,
          error: true,
          limit_reached: true,
          message:
            "Product limit reached. Please upgrade your plan or remove existing products.",
        });
      }

      const {
        language,
        hasRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        youtubeLinks,
        realPrice,
        priceType,
        options: optionsBody,
        variantPrices,
        variantPricesAr,
        customInputs,
        customInputsAr,
        category,
        subcategory,
        colors: colorsBody,
        sizes: sizesBody,
        stock: stockBody,
        isAvailable: isAvailableBody,
      } = req.body;

      let parsedStock = null;
      if (stockBody !== undefined && stockBody !== "" && stockBody !== null) {
        const rawStock = Number(stockBody);
        if (!Number.isInteger(rawStock) || rawStock < 0) {
          return res.status(400).json({
            success: false,
            error: true,
            message: "Stock must be a non-negative integer.",
          });
        }
        parsedStock = rawStock;
      }

      const isAvailablePost =
        isAvailableBody === "false" || isAvailableBody === false ? false : true;

      // cashback needs "manageDiscount"; for everyone else it is ignored (product is saved without cashback)
      const cashbackPayload = normalizeCashbackPayload(
        req.actor.can("manageDiscount") ? req.body : {},
      );

      const parsedYoutubeLinks = youtubeLinks ? JSON.parse(youtubeLinks) : [];
      const normalizedYoutubeLinks =
        await normalizeVideoLinks(parsedYoutubeLinks);

      const isRealPricePost = hasRealPrice === "true" || hasRealPrice === true;

      const rawColors = colorsBody ? JSON.parse(colorsBody) : [];
      const parsedSizes = sizesBody
        ? JSON.parse(sizesBody).filter((s) => {
            if (typeof s === "string") return s && s.trim();
            return s && (s.nameKu?.trim() || s.nameAr?.trim());
          })
        : [];
      const parsedCustomInputs = customInputs
        ? JSON.parse(customInputs).filter((c) => c.name && c.name !== "")
        : [];
      const parsedCustomInputsAr = customInputsAr
        ? JSON.parse(customInputsAr).filter((c) => c.name && c.name !== "")
        : [];
      const parsedOptionsInput = parseOptionsInput(optionsBody);
      const parsedOptions = parsedOptionsInput.rows;
      validateUploadedOptionImageIndexes({
        files: req.files,
        options: parsedOptions,
      });

      validateProductImageUploadLimits({
        plan,
        files: req.files,
        colorCount: rawColors.length,
      });

      const parsedVariantPricesInput = parseVariantPricesInput(
        variantPrices,
        "variantPrices",
      );
      const parsedVariantPricesArInput = parseVariantPricesInput(
        variantPricesAr,
        "variantPricesAr",
      );
      const parsedVariantPrices = parsedVariantPricesInput.rows;
      const parsedVariantPricesAr = parsedVariantPricesArInput.rows;

      validateProductFieldLimits({
        plan,
        colors: rawColors,
        sizes: parsedSizes,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
      });
      validateProductOptionsLimits(plan, parsedOptions);

      if (parsedVariantPrices.length > 0) {
        validateVariantPriceCombinations(plan, parsedVariantPrices);
      }
      if (parsedVariantPricesAr.length > 0) {
        validateVariantPriceCombinations(plan, parsedVariantPricesAr);
      }

      const hasColorsOrSizes =
        rawColors.some((c) => (c.nameKu || c.nameAr || "").trim()) ||
        parsedSizes.length > 0;
      if (hasColorsOrSizes && isRealPricePost) {
        const basePriceConflictError = new Error(
          "Cannot use base price when colors or sizes are provided",
        );
        basePriceConflictError.statusCode = 400;
        basePriceConflictError.clientMessage =
          "You cannot set a Base Price when colors or sizes are added. Please use variant prices instead.";
        throw basePriceConflictError;
      }

      const finalVariantPricesPayload =
        parsedVariantPrices.length > 0 ? parsedVariantPrices : null;
      const finalVariantPricesArPayload =
        parsedVariantPricesArInput.provided && parsedVariantPricesAr.length > 0
          ? parsedVariantPricesAr
          : finalVariantPricesPayload && parsedOptions.length > 0
            ? buildArabicVariantPricesFromOptions(
                finalVariantPricesPayload,
                parsedOptions,
              )
            : null;

      const createPayload = {
        seller_id: id,
        language,
        hasRealPrice: isRealPricePost,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        images: [],
        youtubeLinks: normalizedYoutubeLinks,
        realPrice: isRealPricePost && realPrice !== "" ? realPrice : null,
        priceType,
        options: parsedOptions.length > 0 ? parsedOptions : null,
        variantPrices: finalVariantPricesPayload,
        variantPricesAr: finalVariantPricesArPayload,
        colors: rawColors.length > 0 ? rawColors : null,
        sizes: parsedSizes.length > 0 ? parsedSizes : null,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
        stock: hasColorsOrSizes ? null : parsedStock,
        isAvailable: isAvailablePost,
        category: category || null,
        subcategory: subcategory || null,
        ...cashbackPayload,
      };

      const product = await Product.create(createPayload);

      const uploadedOptionImages = await uploadFirstOptionGroupImagesToR2({
        sellerId: id,
        productId: product.id,
        options: parsedOptions,
        files: req.files,
      });
      if (uploadedOptionImages.changed) {
        await Product.update(
          { options: uploadedOptionImages.options },
          { where: { id: product.id } },
        );
      }

      const tUploadStart = Date.now();
      let totalUploadedBytes = uploadedOptionImages.uploadedBytes;
      const imageFiles = req.files?.images || [];
      const basePath = `shops/${id}/products/${product.id}`;

      const imageUploadResults = await Promise.all(
        imageFiles.map((file, i) =>
          uploadToR2WithThumb(file.buffer, basePath, titleKu || titleAr).then(
            (result) => ({
              ...result,
              isMain: i === 0,
            }),
          ),
        ),
      );

      const imageRecords = imageUploadResults.map(
        ({ mainKey, thumbKey, sizeBytes, totalSizeBytes, isMain }) => {
          totalUploadedBytes += totalSizeBytes;
          return {
            product_id: product.id,
            image_key: mainKey,
            thumb_key: thumbKey,
            is_main: isMain,
            size_bytes: sizeBytes,
          };
        },
      );
      if (imageRecords.length > 0) await ProductImage.bulkCreate(imageRecords);

      const finalColors = rawColors.map((c) => ({ ...c }));
      const tColorStart = Date.now();

      await Promise.all(
        finalColors.map(async (color, i) => {
          const colorFile = req.files?.[`colorImage_${i}`]?.[0];
          if (!colorFile) {
            finalColors[i].imageKey = null;
            return;
          }
          const filename = `${uuidv4()}.webp`;
          const colorSegment = normalizeColorSegment(
            color.nameKu || color.nameAr,
          );
          const key = `shops/${id}/products/${product.id}/colors/${colorSegment}/${filename}`;
          const { sizeBytes } = await uploadColorImageToR2(
            colorFile.buffer,
            key,
          );
          totalUploadedBytes += sizeBytes;
          finalColors[i].imageKey = key;
          finalColors[i].imageSizeBytes = sizeBytes;
        }),
      );

      if (finalColors.length > 0) {
        await Product.update(
          { colors: finalColors },
          { where: { id: product.id } },
        );
      }

      if (totalUploadedBytes > 0)
        await incrementSellerStorage(id, totalUploadedBytes);

      await product.reload();

      res.status(201).json({
        success: true,
        error: false,
        message: "Product created successfully",
        product,
      });

      const _createdProductId = product.id;
      const _createdSellerId = id;
      Seller.findByPk(_createdSellerId, {
        attributes: ["shop_name"],
        raw: true,
      })
        .then((s) => {
          if (s?.shop_name) {
            return notifyGoogle(
              productUrl(s.shop_name, _createdProductId),
              "URL_UPDATED",
            );
          }
        })
        .catch(() => {});
    } catch (error) {
      console.error(error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: true,
        message: error.clientMessage || "Failed to create product",
      });
    }
  },
);

// PUT /edit-product/:productId
router.put(
  "/edit-product/:productId",
  canEditProduct,
  exposeShopIdToLegacyMiddleware,
  uploadRateLimiter,
  productUpload,
  checkStorageLimit,
  async (req, res) => {
    try {
      const sellerId = req.actor.sellerId;
      const { productId } = req.params;

      const product = await Product.findOne({
        where: { id: productId, seller_id: sellerId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Product not found" });
      }

      const sellerPlan = await SellerPlan.findOne({
        where: { seller_id: sellerId },
      });

      if (!sellerPlan) {
        return res.status(403).json({
          success: false,
          error: true,
          message: "No plan found for this seller",
        });
      }

      const plan = await Plan.findByPk(sellerPlan.plan_id);

      const {
        language,
        hasRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice,
        priceType,
        youtubeLinks,
        options: optionsBody,
        variantPrices,
        variantPricesAr,
        customInputs,
        customInputsAr,
        removedImageKeys,
        removedColorImageKeys,
        category,
        colors: colorsBody,
        sizes: sizesBody,
        stock: stockBody,
        isAvailable: isAvailableBody,
      } = req.body;

      let parsedStockEdit = null;
      if (stockBody !== undefined && stockBody !== "" && stockBody !== null) {
        const rawStock = Number(stockBody);
        if (!Number.isInteger(rawStock) || rawStock < 0) {
          return res.status(400).json({
            success: false,
            error: true,
            message: "Stock must be a non-negative integer.",
          });
        }
        parsedStockEdit = rawStock;
      }

      const isAvailableEdit =
        isAvailableBody === "false" || isAvailableBody === false ? false : true;

      // cashback needs "manageDiscount"; for everyone else the existing cashback stays untouched
      const cashbackPayload =
        req.actor.can("manageDiscount") &&
        Object.prototype.hasOwnProperty.call(req.body, "hasCashback")
          ? normalizeCashbackPayload(req.body)
          : {};

      const parsedYoutubeLinks = youtubeLinks ? JSON.parse(youtubeLinks) : [];
      const normalizedYoutubeLinks =
        await normalizeVideoLinks(parsedYoutubeLinks);

      const rawColors = colorsBody ? JSON.parse(colorsBody) : [];
      const parsedSizes = sizesBody
        ? JSON.parse(sizesBody).filter((s) => {
            if (typeof s === "string") return s && s.trim();
            return s && (s.nameKu?.trim() || s.nameAr?.trim());
          })
        : [];
      const parsedVariantPricesInput = parseVariantPricesInput(
        variantPrices,
        "variantPrices",
      );
      const parsedVariantPricesArInput = parseVariantPricesInput(
        variantPricesAr,
        "variantPricesAr",
      );
      const parsedVariantPrices = parsedVariantPricesInput.rows;
      const parsedVariantPricesAr = parsedVariantPricesArInput.rows;
      const parsedOptionsInput = parseOptionsInput(optionsBody);
      const parsedOptions = parsedOptionsInput.rows;
      validateUploadedOptionImageIndexes({
        files: req.files,
        options: parsedOptions,
      });
      const parsedCustomInputs = customInputs
        ? JSON.parse(customInputs).filter((c) => c.name && c.name !== "")
        : [];
      const parsedCustomInputsAr = customInputsAr
        ? JSON.parse(customInputsAr).filter((c) => c.name && c.name !== "")
        : [];

      const removedMainImageKeys = removedImageKeys
        ? JSON.parse(removedImageKeys)
        : [];
      const removedColorKeys = removedColorImageKeys
        ? JSON.parse(removedColorImageKeys).filter(Boolean)
        : [];

      const existingMainImages = await ProductImage.count({
        where: { product_id: productId },
      });
      const remainingExistingMainImages = Math.max(
        0,
        existingMainImages - removedMainImageKeys.length,
      );
      const uploadedColorIndexes = new Set(
        getUploadedColorImageIndexes(req.files),
      );
      const existingColorImages = (product.colors || []).filter(
        (color, index) =>
          color.imageKey &&
          !removedColorKeys.includes(color.imageKey) &&
          !uploadedColorIndexes.has(index),
      ).length;

      validateProductImageUploadLimits({
        plan,
        files: req.files,
        colorCount: rawColors.length,
        existingMainImages: remainingExistingMainImages,
        existingColorImages,
      });

      validateProductFieldLimits({
        plan,
        colors: rawColors,
        sizes: parsedSizes,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
      });

      if (parsedVariantPrices.length > 0) {
        validateVariantPriceCombinations(plan, parsedVariantPrices);
      }
      if (parsedVariantPricesAr.length > 0) {
        validateVariantPriceCombinations(plan, parsedVariantPricesAr);
      }

      const isRealPrice = hasRealPrice === "true" || hasRealPrice === true;
      const hasColorsOrSizesEdit =
        rawColors.some((c) => (c.nameKu || c.nameAr || "").trim()) ||
        parsedSizes.length > 0;
      if (hasColorsOrSizesEdit && isRealPrice) {
        const basePriceConflictError = new Error(
          "Cannot use base price when colors or sizes are provided",
        );
        basePriceConflictError.statusCode = 400;
        basePriceConflictError.clientMessage =
          "You cannot set a Base Price when colors or sizes are added. Please use variant prices instead.";
        throw basePriceConflictError;
      }

      if (removedImageKeys) {
        const keys = removedMainImageKeys;
        if (keys.length > 0) {
          const records = await ProductImage.findAll({
            where: { product_id: productId, image_key: keys },
          });
          const removedBytes = (
            await Promise.all(
              records.map((record) => getProductImageRecordBytes(record)),
            )
          ).reduce((sum, bytes) => sum + bytes, 0);
          const allR2Keys = records.flatMap((r) =>
            [r.image_key, r.thumb_key].filter(Boolean),
          );
          await deleteMultipleFromR2(allR2Keys);
          await ProductImage.destroy({
            where: { product_id: productId, image_key: keys },
          });
          await decrementSellerStorage(sellerId, removedBytes);
        }
      }

      if (removedColorImageKeys) {
        const keys = removedColorKeys;
        if (keys.length > 0) {
          const existingColors = product.colors || [];
          const removedColorBytes = existingColors
            .filter((c) => keys.includes(c.imageKey))
            .reduce((sum, c) => sum + (c.imageSizeBytes || 0), 0);
          await deleteMultipleFromR2(keys);
          if (removedColorBytes > 0)
            await decrementSellerStorage(sellerId, removedColorBytes);
        }
      }

      let totalUploadedBytes = 0;
      const imageFiles = req.files?.images || [];
      if (imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const basePath = `shops/${sellerId}/products/${productId}`;
          const { mainKey, thumbKey, sizeBytes, totalSizeBytes } =
            await uploadToR2WithThumb(
              file.buffer,
              basePath,
              titleKu || titleAr,
            );
          totalUploadedBytes += totalSizeBytes;
          await ProductImage.create({
            product_id: productId,
            image_key: mainKey,
            thumb_key: thumbKey,
            is_main: remainingExistingMainImages === 0 && i === 0,
            size_bytes: sizeBytes,
          });
        }
      }

      const dbColors = product.colors || [];
      const finalColors = rawColors.map((c) => ({ ...c }));
      for (let i = 0; i < finalColors.length; i++) {
        const colorFile = req.files?.[`colorImage_${i}`]?.[0];
        if (colorFile) {
          const oldImageKey = dbColors[i]?.imageKey || null;
          const filename = `${uuidv4()}.webp`;
          const colorSegment = normalizeColorSegment(
            finalColors[i].nameKu || finalColors[i].nameAr,
          );
          const key = `shops/${sellerId}/products/${productId}/colors/${colorSegment}/${filename}`;

          const { sizeBytes } = await uploadColorImageToR2(
            colorFile.buffer,
            key,
          );
          totalUploadedBytes += sizeBytes;
          finalColors[i].imageKey = key;
          finalColors[i].imageSizeBytes = sizeBytes;

          if (oldImageKey) {
            const oldDbColor = dbColors.find((c) => c.imageKey === oldImageKey);
            if (oldDbColor?.imageSizeBytes)
              await decrementSellerStorage(sellerId, oldDbColor.imageSizeBytes);
            await deleteFromR2(oldImageKey);
          }
        } else {
          if (dbColors[i]?.imageKey) {
            finalColors[i].imageKey = dbColors[i].imageKey;
            finalColors[i].imageSizeBytes = dbColors[i].imageSizeBytes || 0;
          }
        }
      }

      const existingVariantPrices = normalizeVariantPriceRows(
        product.variantPrices || [],
      );
      const existingVariantPricesAr = normalizeVariantPriceRows(
        product.variantPricesAr || [],
      );
      const existingOptions = normalizeOptionsPayload(product.options || []);
      let finalOptionsPayload = parsedOptionsInput.provided
        ? parsedOptions
        : existingOptions;
      validateProductOptionsLimits(plan, finalOptionsPayload);
      const uploadedOptionImages = await uploadFirstOptionGroupImagesToR2({
        sellerId,
        productId,
        options: finalOptionsPayload,
        files: req.files,
      });
      if (uploadedOptionImages.changed) {
        finalOptionsPayload = uploadedOptionImages.options;
      }
      const finalVariantPricesPayload = parsedVariantPricesInput.provided
        ? parsedVariantPrices
        : existingVariantPrices;
      const finalVariantPricesArPayload = parsedVariantPricesArInput.provided
        ? parsedVariantPricesAr
        : parsedVariantPricesInput.provided && finalOptionsPayload.length > 0
          ? buildArabicVariantPricesFromOptions(
              finalVariantPricesPayload,
              finalOptionsPayload,
            )
          : existingVariantPricesAr;

      totalUploadedBytes += uploadedOptionImages.uploadedBytes;

      if (totalUploadedBytes > 0)
        await incrementSellerStorage(sellerId, totalUploadedBytes);

      const updatePayload = {
        language,
        hasRealPrice: isRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice: isRealPrice && realPrice !== "" ? realPrice : null,
        priceType,
        options:
          finalOptionsPayload.length > 0
            ? finalOptionsPayload
            : product.options || null,
        youtubeLinks: normalizedYoutubeLinks,
        variantPrices:
          finalVariantPricesPayload.length > 0
            ? finalVariantPricesPayload
            : null,
        variantPricesAr:
          finalVariantPricesArPayload.length > 0
            ? finalVariantPricesArPayload
            : null,
        colors: finalColors.length > 0 ? finalColors : null,
        sizes: parsedSizes.length > 0 ? parsedSizes : null,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
        category: category || null,
        stock: hasColorsOrSizesEdit ? null : parsedStockEdit,
        isAvailable: isAvailableEdit,
        ...cashbackPayload,
      };

      await Product.update(updatePayload, {
        where: { id: productId, seller_id: sellerId },
      });
      await product.reload();

      res.status(200).json({
        success: true,
        error: false,
        message: "Product updated successfully",
        product,
      });

      const _editedProductId = productId;
      const _editedSellerId = sellerId;
      Seller.findByPk(_editedSellerId, { attributes: ["shop_name"], raw: true })
        .then((s) => {
          if (s?.shop_name) {
            return notifyGoogle(
              productUrl(s.shop_name, _editedProductId),
              "URL_UPDATED",
            );
          }
        })
        .catch(() => {});
    } catch (error) {
      console.error(error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: true,
        message: error.clientMessage || "Failed to update product",
      });
    }
  },
);

// DELETE /delete-product/:productId
router.delete(
  "/delete-product/:productId",
  canDeleteProduct,
  async (req, res) => {
    try {
      const sellerId = req.actor.sellerId;
      const { productId } = req.params;

      const product = await Product.findOne({
        where: { id: productId, seller_id: sellerId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Product not found" });
      }

      const imageRecords = await ProductImage.findAll({
        where: { product_id: productId },
      });

      if (imageRecords.length > 0) {
        const keys = imageRecords.map((r) => r.image_key);
        const thumbKeys = imageRecords.map((r) => r.thumb_key).filter(Boolean);
        const totalBytes = (
          await Promise.all(
            imageRecords.map((record) => getProductImageRecordBytes(record)),
          )
        ).reduce((sum, bytes) => sum + bytes, 0);
        await deleteMultipleFromR2([...keys, ...thumbKeys]);
        await ProductImage.destroy({ where: { product_id: productId } });
        await decrementSellerStorage(sellerId, totalBytes);
      }

      const _rawProductColors = product.colors;
      const _parsedProductColors = Array.isArray(_rawProductColors)
        ? _rawProductColors
        : typeof _rawProductColors === "string"
          ? (() => {
              try {
                return JSON.parse(_rawProductColors);
              } catch {
                return [];
              }
            })()
          : [];
      const colorImages = _parsedProductColors.filter((c) => c && c.imageKey);
      if (colorImages.length > 0) {
        const colorKeys = colorImages.map((c) => c.imageKey);
        const colorBytes = colorImages.reduce(
          (sum, c) => sum + (c.imageSizeBytes || 0),
          0,
        );
        await deleteMultipleFromR2(colorKeys);
        if (colorBytes > 0) await decrementSellerStorage(sellerId, colorBytes);
      }

      await product.destroy();

      res.status(200).json({
        success: true,
        error: false,
        message: "Product deleted successfully",
      });

      const _deletedProductId = productId;
      const _deletedSellerId = sellerId;
      Seller.findByPk(_deletedSellerId, {
        attributes: ["shop_name"],
        raw: true,
      })
        .then((s) => {
          if (s?.shop_name) {
            return notifyGoogle(
              productUrl(s.shop_name, _deletedProductId),
              "URL_DELETED",
            );
          }
        })
        .catch(() => {});
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to delete product",
      });
    }
  },
);

router.get("/products/shop/:shopName", async (req, res) => {
  try {
    const { shopName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
      attributes: ["id", "shop_name"],
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: { seller_id: seller.id },
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "images",
        "realPrice",
        "priceType",
        "hasRealPrice",
        "language",
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "category",
        "hasCashback",
        "cashbackType",
        "cashbackValue",
        "cashbackStartDate",
        "cashbackEndDate",
        "cashbackMinOrderAmount",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const filteredProducts = products.filter((p) => {
      const hasVariants =
        (p.variantPrices && p.variantPrices.length > 0) ||
        (p.variantPricesAr && p.variantPricesAr.length > 0);
      if (hasVariants && !p.realPrice) return false;
      return true;
    });

    res.status(200).json({
      success: true,
      error: false,
      data: filteredProducts,
      total: filteredProducts.length,
      hasMore: offset + limit < count,
      seller,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch products",
    });
  }
});

export default router;
