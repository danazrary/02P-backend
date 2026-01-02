import express from "express";
import multer from "multer";
import path from "path";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
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
      const {
        language,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        youtubeLinks,
        realPrice,
        priceType,
        hasDiscount,
        discountPrice,
        discountType,
        discountDays,
        discountHours,
        discountMinutes,
        variantPrices,
        customInputs,
      } = req.body;

      const { id } = req.user;

      // Save uploaded images paths
      const images = req.files
        ? req.files.map((file) => `/uploads/products/${file.filename}`)
        : [];
      console.log(req.body);
      console.log(req.files);

      const product = await Product.create({
        seller_id: id,
        language,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        images,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        realPrice,
        priceType,
        hasDiscount: hasDiscount === "true",
        discountPrice: discountPrice || null,
        discountType: discountType || null,
        discountDays: discountDays || 0,
        discountHours: discountHours || 0,
        discountMinutes: discountMinutes || 1,
        variantPrices: variantPrices ? JSON.parse(variantPrices) : [],
        customInputs: customInputs ? JSON.parse(customInputs) : [],
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
  }
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
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice,
        priceType,
        hasDiscount,
        discountPrice,
        discountType,
        discountDays,
        discountHours,
        discountMinutes,
        youtubeLinks,
        variantPrices,
        customInputs,
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
          (file) => `/uploads/products/${file.filename}`
        );
        finalImages = [...finalImages, ...newImages];
      }

      await product.update({
        language,
        titleKu,
        titleAr,
        descriptionKu,
        descriptionAr,
        realPrice,
        priceType,
        hasDiscount: hasDiscount === "true" || hasDiscount === true,
        discountPrice: hasDiscount ? discountPrice : null,
        discountType: hasDiscount ? discountType : null,
        discountDays: discountDays || 0,
        discountHours: discountHours || 0,
        discountMinutes: discountMinutes || 1,
        youtubeLinks: youtubeLinks ? JSON.parse(youtubeLinks) : [],
        variantPrices: variantPrices ? JSON.parse(variantPrices) : [],
        customInputs: customInputs ? JSON.parse(customInputs) : [],
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
  }
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
  }
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
