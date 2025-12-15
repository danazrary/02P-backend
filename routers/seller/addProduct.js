import express from "express";
import multer from "multer";
import path from "path";
import Product from "../../database/products.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
const router = express.Router();

// Multer setup to save images in /uploads folder
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // folder must exist
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

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
      console.log(req.body);

      // Save uploaded images paths
      const images = req.files
        ? req.files.map((file) => `/uploads/${file.filename}`)
        : [];

      const product = await Product.create({
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

      res
        .status(201)
        .json({ message: "Product created successfully", product });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create product" });
    }
  }
);

export default router;
