import express from "express";
import { v4 as uuidv4 } from "uuid";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { uploadRateLimiter } from "../../middlewares/rateLimitReq.js";
import {
  checkStorageLimit,
  incrementSellerStorage,
  decrementSellerStorage,
} from "../../middlewares/checkStorageLimit.js";
import {
  r2Multer,
  buildR2Key,
  uploadToR2,
  uploadToR2WithThumb,
  deleteFromR2,
  deleteMultipleFromR2,
  isLocalEnv,
} from "../../utils/r2.js";
import getTikTokEmbedUrl, {
  isTikTokUrlCandidate,
} from "../../utils/getTikTokEmbedUrl.js";

const router = express.Router();
const MAX_COLOR_IMAGE_FIELDS = 15;
const ADVANCED_PLAN_ALIASES = new Set([
  "large seller",
  "plus",
  "plus plan",
  "business",
  "business pro",
  "business pro plan",
]);

/** Accept product images + up to 15 per-color images. */
const productUpload = r2Multer.fields([
  { name: "images", maxCount: 5 },
  ...Array.from({ length: MAX_COLOR_IMAGE_FIELDS }, (_, index) => ({
    name: `colorImage_${index}`,
    maxCount: 1,
  })),
]);

/**
 * Build variantPricesAr by replacing Kurdish color and size names with Arabic ones.
 * Falls back to original value if no mapping found.
 */
function deriveVariantPricesAr(variantPrices, colors, sizes) {
  const kuToArColor = {};
  (colors || []).forEach((c) => {
    if (c.nameKu && c.nameAr) kuToArColor[c.nameKu] = c.nameAr;
    if (c.nameAr) kuToArColor[c.nameAr] = c.nameAr; // identity for arabic-only products
  });
  const kuToArSize = {};
  (sizes || []).forEach((s) => {
    if (typeof s === "string") {
      kuToArSize[s] = s; // old string format — identity
    } else {
      if (s.nameKu && s.nameAr) kuToArSize[s.nameKu] = s.nameAr;
      if (s.nameAr) kuToArSize[s.nameAr] = s.nameAr; // identity for arabic-only
    }
  });
  return variantPrices.map((v) => ({
    ...v,
    color: kuToArColor[v.color] ?? v.color,
    size: kuToArSize[v.size] ?? v.size,
  }));
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
      invalidTikTokError.clientMessage =
        `Invalid TikTok URL provided for video link ${index + 1}`;
      throw invalidTikTokError;
    }

    normalizedLinks.push(embedUrl);
  }

  return normalizedLinks;
}

function normalizePlanValue(planName) {
  return String(planName || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getProductFieldLimit(plan) {
  const normalizedPlan = normalizePlanValue(plan?.name);
  const compactPlan = normalizedPlan.replace(/\s+/g, "");
  const isAdvancedPlan =
    ADVANCED_PLAN_ALIASES.has(normalizedPlan) ||
    compactPlan === "businesspro" ||
    (plan?.max_products ?? 0) >= 200;

  return isAdvancedPlan ? 15 : 5;
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
  planLimitError.clientMessage =
    `Your current seller plan allows up to ${fieldLimit} colors, ${fieldLimit} sizes, and ${fieldLimit} custom fields per product.`;
  throw planLimitError;
}

// Route to create product
router.post(
  "/add-product",
  jwtVerifySellerToken,
  uploadRateLimiter,
  productUpload,
  checkStorageLimit,
  async (req, res) => {
    try {
      const { id } = req.user;
      console.log(
        `🛒 Add-product — seller ${id} — env: ${isLocalEnv ? "LOCAL (developeLH)" : "VPS (product)"}`,
      );

      // Check seller plan and product limit
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

      // Check if free plan - don't allow adding products
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
        variantPrices,
        customInputs,
        customInputsAr,
        category,
        colors: colorsBody,
        sizes: sizesBody,
      } = req.body;

      const parsedYoutubeLinks = youtubeLinks ? JSON.parse(youtubeLinks) : [];
      const normalizedYoutubeLinks = await normalizeVideoLinks(
        parsedYoutubeLinks,
      );

      const isRealPricePost = hasRealPrice === "true" || hasRealPrice === true;

      // Parse colors [{nameKu, nameAr}] and sizes [{nameKu, nameAr}]
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

      // Parse variant price combinations
      const parsedVariantPrices = variantPrices
        ? JSON.parse(variantPrices).filter((v) => v.price && v.price !== "")
        : [];

      validateProductFieldLimits({
        plan,
        colors: rawColors,
        sizes: parsedSizes,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
      });

      // Auto-derive Arabic variant prices from colors and sizes mapping
      const derivedVariantPricesAr = deriveVariantPricesAr(
        parsedVariantPrices,
        rawColors,
        parsedSizes,
      );

      // Create product first so we have its ID for R2 key paths
      const product = await Product.create({
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
        variantPrices: parsedVariantPrices,
        variantPricesAr: derivedVariantPricesAr,
        colors: rawColors.length > 0 ? rawColors : null,
        sizes: parsedSizes.length > 0 ? parsedSizes : null,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
        category: category || null,
      });

      // Upload product images to R2 (main 1280px + thumbnail 300px)
      let totalUploadedBytes = 0;
      const imageRecords = [];
      const imageFiles = req.files?.images || [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const basePath = `shops/${id}/products/${product.id}`;
        const { mainKey, thumbKey, sizeBytes } = await uploadToR2WithThumb(
          file.buffer,
          basePath,
        );
        totalUploadedBytes += sizeBytes;
        imageRecords.push({
          product_id: product.id,
          image_key: mainKey,
          thumb_key: thumbKey,
          is_main: i === 0,
          size_bytes: sizeBytes,
        });
      }
      if (imageRecords.length > 0) await ProductImage.bulkCreate(imageRecords);

      // Upload per-color images and attach imageKey to each color
      const finalColors = rawColors.map((c) => ({ ...c }));
      for (let i = 0; i < finalColors.length; i++) {
        const colorFile = req.files?.[`colorImage_${i}`]?.[0];
        if (colorFile) {
          const filename = `${uuidv4()}.webp`;
          const key = `shops/${id}/products/${product.id}/colors/${filename}`;
          const { sizeBytes } = await uploadToR2(colorFile.buffer, key);
          totalUploadedBytes += sizeBytes;
          finalColors[i].imageKey = key;
          finalColors[i].imageSizeBytes = sizeBytes;
        } else {
          finalColors[i].imageKey = null;
        }
      }
      if (finalColors.length > 0) {
        await product.update({ colors: finalColors });
      }

      if (totalUploadedBytes > 0)
        await incrementSellerStorage(id, totalUploadedBytes);

      res.status(201).json({
        success: true,
        error: false,
        message: "Product created successfully",
        product,
      });
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

router.put(
  "/edit-product/:productId",
  jwtVerifySellerToken,
  uploadRateLimiter,
  productUpload,
  checkStorageLimit,
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { productId } = req.params;
      console.log(
        `✏️  Edit-product ${productId} — seller ${sellerId} — env: ${isLocalEnv ? "LOCAL (developeLH)" : "VPS (product)"}`,
      );

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
        variantPrices,
        customInputs,
        customInputsAr,
        removedImageKeys,
        removedColorImageKeys,
        category,
        colors: colorsBody,
        sizes: sizesBody,
      } = req.body;

      const parsedYoutubeLinks = youtubeLinks ? JSON.parse(youtubeLinks) : [];
      const normalizedYoutubeLinks = await normalizeVideoLinks(
        parsedYoutubeLinks,
      );

      const rawColors = colorsBody ? JSON.parse(colorsBody) : [];
      const parsedSizes = sizesBody
        ? JSON.parse(sizesBody).filter((s) => {
            if (typeof s === "string") return s && s.trim();
            return s && (s.nameKu?.trim() || s.nameAr?.trim());
          })
        : [];
      const parsedVariantPrices = variantPrices
        ? JSON.parse(variantPrices).filter((v) => v.price && v.price !== "")
        : [];
      const parsedCustomInputs = customInputs
        ? JSON.parse(customInputs).filter((c) => c.name && c.name !== "")
        : [];
      const parsedCustomInputsAr = customInputsAr
        ? JSON.parse(customInputsAr).filter((c) => c.name && c.name !== "")
        : [];

      validateProductFieldLimits({
        plan,
        colors: rawColors,
        sizes: parsedSizes,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
      });

      // Delete removed product images (main + thumb) and update storage
      if (removedImageKeys) {
        const keys = JSON.parse(removedImageKeys);
        if (keys.length > 0) {
          const records = await ProductImage.findAll({
            where: { product_id: productId, image_key: keys },
          });
          const removedBytes = records.reduce(
            (sum, r) => sum + (r.size_bytes || 0),
            0,
          );
          // Delete both the main key and its thumbnail from R2
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

      // Delete removed color images from R2 and decrement storage
      if (removedColorImageKeys) {
        const keys = JSON.parse(removedColorImageKeys).filter(Boolean);
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

      // Upload new product images to R2 (main 1280px + thumbnail 300px)
      let totalUploadedBytes = 0;
      const imageFiles = req.files?.images || [];
      if (imageFiles.length > 0) {
        const existingCount = await ProductImage.count({
          where: { product_id: productId },
        });
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const basePath = `shops/${sellerId}/products/${productId}`;
          const { mainKey, thumbKey, sizeBytes } = await uploadToR2WithThumb(
            file.buffer,
            basePath,
          );
          totalUploadedBytes += sizeBytes;
          await ProductImage.create({
            product_id: productId,
            image_key: mainKey,
            thumb_key: thumbKey,
            is_main: existingCount === 0 && i === 0,
            size_bytes: sizeBytes,
          });
        }
      }

      const finalColors = rawColors.map((c) => ({ ...c }));
      for (let i = 0; i < finalColors.length; i++) {
        const colorFile = req.files?.[`colorImage_${i}`]?.[0];
        if (colorFile) {
          // Decrement storage for the old color image being replaced
          if (finalColors[i].imageKey) {
            const oldColor = (product.colors || []).find(
              (c) => c.imageKey === finalColors[i].imageKey,
            );
            if (oldColor?.imageSizeBytes)
              await decrementSellerStorage(sellerId, oldColor.imageSizeBytes);
            await deleteFromR2(finalColors[i].imageKey);
          }
          const filename = `${uuidv4()}.webp`;
          const key = `shops/${sellerId}/products/${productId}/colors/${filename}`;
          const { sizeBytes } = await uploadToR2(colorFile.buffer, key);
          totalUploadedBytes += sizeBytes;
          finalColors[i].imageKey = key;
          finalColors[i].imageSizeBytes = sizeBytes;
        }
        // If no new file, keep existing imageKey (and imageSizeBytes) as-is
      }

      if (totalUploadedBytes > 0)
        await incrementSellerStorage(sellerId, totalUploadedBytes);

      const isRealPrice = hasRealPrice === "true" || hasRealPrice === true;

      const derivedVariantPricesAr = deriveVariantPricesAr(
        parsedVariantPrices,
        finalColors,
        parsedSizes,
      );

      await product.update({
        language,
        hasRealPrice: isRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice: isRealPrice && realPrice !== "" ? realPrice : null,
        priceType,
        youtubeLinks: normalizedYoutubeLinks,
        variantPrices: parsedVariantPrices,
        variantPricesAr: derivedVariantPricesAr,
        colors: finalColors.length > 0 ? finalColors : null,
        sizes: parsedSizes.length > 0 ? parsedSizes : null,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
        category: category || null,
      });

      res.status(200).json({
        success: true,
        error: false,
        message: "Product updated successfully",
        product,
      });
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

router.delete(
  "/delete-product/:productId",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { productId } = req.params;

      const product = await Product.findOne({
        where: { id: productId, seller_id: sellerId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Product not found" });
      }

      // Delete all R2 images for this product and update storage
      const imageRecords = await ProductImage.findAll({
        where: { product_id: productId },
      });

      if (imageRecords.length > 0) {
        const keys = imageRecords.map((r) => r.image_key);
        const thumbKeys = imageRecords.map((r) => r.thumb_key).filter(Boolean);
        const totalBytes = imageRecords.reduce(
          (sum, r) => sum + (r.size_bytes || 0),
          0,
        );
        await deleteMultipleFromR2([...keys, ...thumbKeys]);
        await ProductImage.destroy({ where: { product_id: productId } });
        await decrementSellerStorage(sellerId, totalBytes);
      }

      // Delete color images from R2 and decrement their storage
      const colorImages = (product.colors || []).filter((c) => c.imageKey);
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

// Route to get products by seller shop name (paginated, lightweight fields)
router.get("/products/shop/:shopName", async (req, res) => {
  try {
    const { shopName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    // Find seller by shop name
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

    // Get products with only the fields needed by frontend
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
        "variantPrices",
        "variantPricesAr",
        "category",
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

    // Filter out products that have variantPrices or variantPricesAr but no realPrice
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
