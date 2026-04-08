import express from "express";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  uploadProducts,
  getImageUrlPath,
  deleteImage,
  convertToWebp,
} from "../../utils/uploadHandler.js";
import { toUTC } from "../../utils/timezoneHandler.js";

const router = express.Router();

// Use centralized upload middleware that handles environment-based storage
// In development (NODE_ENV=development): saves to backend/uploads/products
// In production (NODE_ENV=production): saves to VPS_UPLOAD_PATH/products
const upload = uploadProducts;

// Route to create product
router.post(
  "/add-product",
  jwtVerifySellerToken,
  upload.array("images", 5),
  convertToWebp(),
  async (req, res) => {
    try {
      console.log("started");
      
      const { id } = req.user;

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
        hasDiscount,
        discount_percent,
        discountType,
        discountStartDate,
        discountEndDate,
        variantPrices,
        variantPricesAr,
        customInputs,
        customInputsAr,
        category,
      } = req.body;

      //  const { id } = req.user;

      // Save uploaded images paths using environment-aware path
      const images = req.files
        ? req.files.map((file) => getImageUrlPath("products", file.filename))
        : [];

      const isRealPricePost = hasRealPrice === "true" || hasRealPrice === true;

      // ⚠️ IMPORTANT: Convert discount dates to UTC before storing in database
      const utcDiscountStartDate = toUTC(discountStartDate);
      const utcDiscountEndDate = toUTC(discountEndDate);

      const product = await Product.create({
        seller_id: id,
        language,
        hasRealPrice: isRealPricePost,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        images,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        realPrice: isRealPricePost && realPrice !== "" ? realPrice : null,
        priceType,
        hasDiscount: hasDiscount === "true",
        discount_percent: discount_percent || null,
        discountType: discountType || null,
        discountStartDate: utcDiscountStartDate || null,
        discountEndDate: utcDiscountEndDate || null,
        variantPrices: variantPrices
          ? JSON.parse(variantPrices).filter((v) => v.price && v.price !== "")
          : [],
        variantPricesAr: variantPricesAr
          ? JSON.parse(variantPricesAr).filter((v) => v.price && v.price !== "")
          : [],
        customInputs: customInputs
          ? JSON.parse(customInputs).filter((c) => c.name && c.name !== "")
          : [],
        customInputsAr: customInputsAr
          ? JSON.parse(customInputsAr).filter((c) => c.name && c.name !== "")
          : [],
        category: category || null,
      });

      res.status(201).json({
        success: true,
        error: false,
        message: "Product created successfully",
        product,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to create product",
      });
    }
  },
);

router.put(
  "/edit-product/:productId",
  jwtVerifySellerToken,
  upload.array("images", 5),
  convertToWebp(),
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

      const {
        language,
        hasRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice,
        priceType,
        hasDiscount,
        discount_percent,
        discountType,
        discountStartDate,
        discountEndDate,
        youtubeLinks,
        variantPrices,
        variantPricesAr,
        customInputs,
        customInputsAr,
        existingImages,
        removedImages,
        category,
      } = req.body;

      /* 🗑️ Delete removed images from disk */
      if (removedImages) {
        const parsedRemoved = JSON.parse(removedImages);
        parsedRemoved.forEach((img) => deleteImage(img));
      }

      /* 🖼️ Keep existing images */
      let finalImages = existingImages ? JSON.parse(existingImages) : [];

      /* ➕ Add new uploaded images */
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map((file) =>
          getImageUrlPath("products", file.filename),
        );
        finalImages = [...finalImages, ...newImages];
      }

      const isRealPrice = hasRealPrice === "true" || hasRealPrice === true;

      // ⚠️ IMPORTANT: Convert discount dates to UTC before storing in database
      const utcDiscountStartDate = toUTC(discountStartDate);
      const utcDiscountEndDate = toUTC(discountEndDate);

      // Parse and filter out empty variant/custom rows
      const parsedVariantPrices = variantPrices
        ? JSON.parse(variantPrices).filter((v) => v.price && v.price !== "")
        : [];
      const parsedVariantPricesAr = variantPricesAr
        ? JSON.parse(variantPricesAr).filter((v) => v.price && v.price !== "")
        : [];
      const parsedCustomInputs = customInputs
        ? JSON.parse(customInputs).filter((c) => c.name && c.name !== "")
        : [];
      const parsedCustomInputsAr = customInputsAr
        ? JSON.parse(customInputsAr).filter((c) => c.name && c.name !== "")
        : [];

      await product.update({
        language,
        hasRealPrice: isRealPrice,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice: isRealPrice && realPrice !== "" ? realPrice : null,
        priceType,
        hasDiscount: hasDiscount === "true" || hasDiscount === true,
        discount_percent: hasDiscount ? discount_percent : null,
        discountType: hasDiscount ? discountType : null,
        discountStartDate:
          hasDiscount && discountType === "timer" ? utcDiscountStartDate : null,
        discountEndDate:
          hasDiscount && discountType === "timer" ? utcDiscountEndDate : null,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        variantPrices: parsedVariantPrices,
        variantPricesAr: parsedVariantPricesAr,
        customInputs: parsedCustomInputs,
        customInputsAr: parsedCustomInputsAr,
        images: finalImages,
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
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to update product",
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

      /* 🧹 Delete all images from disk */
      if (product.images && product.images.length > 0) {
        product.images.forEach((img) => deleteImage(img));
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
