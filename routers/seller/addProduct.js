import express from "express";
import multer from "multer";
import path from "path";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import fs from "fs";
const router = express.Router();

// Multer setup to save images in /uploads folder
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/products"); // folder must exist
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const deleteFileIfExists = (filePath) => {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};
const upload = multer({
  storage,
  limits: { fieldSize: 10 * 1024 * 1024 }, // 10 MB per field
});

// Route to create product
router.post(
  "/add-product",
  jwtVerifySellerToken,
  upload.array("images", 5),
  async (req, res) => {
    try {
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
      } = req.body;

      //  const { id } = req.user;

      // Save uploaded images paths
      const images = req.files
        ? req.files.map((file) => `/uploads/products/${file.filename}`)
        : [];
      console.log(req.body);
      console.log(req.files);

      const product = await Product.create({
        seller_id: id,
        language,
        hasRealPrice: hasRealPrice === "true" || hasRealPrice === true,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        images,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        realPrice: hasRealPrice === "true" ? realPrice : null,
        priceType,
        hasDiscount: hasDiscount === "true",
        discount_percent: discount_percent || null,
        discountType: discountType || null,
        discountStartDate: discountStartDate || null,
        discountEndDate: discountEndDate || null,
        variantPrices: variantPrices ? JSON.parse(variantPrices) : [],
        variantPricesAr: variantPricesAr ? JSON.parse(variantPricesAr) : [],
        customInputs: customInputs ? JSON.parse(customInputs) : [],
        customInputsAr: customInputsAr ? JSON.parse(customInputsAr) : [],
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
      } = req.body;

      /* 🗑️ Delete removed images from disk */
      if (removedImages) {
        const parsedRemoved = JSON.parse(removedImages);
        parsedRemoved.forEach((img) => deleteFileIfExists(img));
      }

      /* 🖼️ Keep existing images */
      let finalImages = existingImages ? JSON.parse(existingImages) : [];

      /* ➕ Add new uploaded images */
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map(
          (file) => `/uploads/products/${file.filename}`,
        );
        finalImages = [...finalImages, ...newImages];
      }

      await product.update({
        language,
        hasRealPrice: hasRealPrice === "true" || hasRealPrice === true,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice,
        priceType,
        hasDiscount: hasDiscount === "true" || hasDiscount === true,
        discount_percent: hasDiscount ? discount_percent : null,
        discountType: hasDiscount ? discountType : null,
        discountStartDate:
          hasDiscount && discountType === "timer" ? discountStartDate : null,
        discountEndDate:
          hasDiscount && discountType === "timer" ? discountEndDate : null,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        variantPrices: variantPrices ? JSON.parse(variantPrices) : [],
        variantPricesAr: variantPricesAr ? JSON.parse(variantPricesAr) : [],
        customInputs: customInputs ? JSON.parse(customInputs) : [],
        customInputsAr: customInputsAr ? JSON.parse(customInputsAr) : [],
        images: finalImages,
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
        product.images.forEach((img) => deleteFileIfExists(img));
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

// Route to get all products by seller shop name
router.get("/products/shop/:shopName", async (req, res) => {
  try {
    const { shopName } = req.params;

    // Find seller by shop name
    const seller = await Seller.findOne({
      where: { shop_name: shopName },
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    // Get all products for this seller
    const products = await Product.findAll({
      where: { seller_id: seller.id },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      error: false,
      data: products,
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
