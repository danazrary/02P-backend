import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import ProductV2 from "../../database/productv2.js";
import SellerV2 from "../../database/sellerv2.js";
import Report from "../../database/report.js";
import SellerOffer from "../../database/sellerOffer.js";
import Feedback from "../../database/feedback.js";
import { Op } from "sequelize";
import {
  checkAndCleanProductV2Expiration,
  normalizeProductV2,
} from "../../utils/productV2Promos.js";
const router = Router();

const PRODUCT_V2_ATTRIBUTES = [
  "id",
  "seller_id",
  "title",
  "description",
  "custom_inputs",
  "language",
  "barcode",
  "sku",
  "category",
  "subcategory",
  "cost_price",
  "retail_price",
  "price_type",
  "variant_r",
  "variant_r_ar",
  "is_wholesale_only",
  "wholesale_price",
  "min_wholesale_quantity",
  "wholesale_tier_pricing",
  "variant_w",
  "discount",
  "cashback",
  "free_delivery",
  "stock_quantity",
  "low_stock_alert",
  "images",
  "video_links",
  "views",
  "extra_attributes",
  "is_published",
  "sort_order",
];

// Get cart products with full data by IDs
router.post("/cart-products", async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "productIds array is required",
      });
    }

    // Limit to 50 products max
    const limitedIds = productIds.slice(0, 50);

    // Get full product data
    const rawProducts = await ProductV2.findAll({
      where: { id: { [Op.in]: limitedIds } },
      attributes: PRODUCT_V2_ATTRIBUTES,
    });

    // Check and clean expired discounts, cashback, and free delivery
    const cleanedRows = await checkAndCleanProductV2Expiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProductV2(row));

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        error: false,
        products: [],
        offers: [],
        seller: null,
      });
    }

    // Get seller ID from first product
    const sellerId = products[0].seller_id;

    // Get all active offers for this seller
    const currentDate = new Date();
    const offers = await SellerOffer.findAll({
      where: {
        seller_id: sellerId,
        is_active: true,
        start_date: { [Op.lte]: currentDate },
        end_date: { [Op.gte]: currentDate },
      },
    });

    // Get seller info (phone for WhatsApp)
    const seller = await SellerV2.findByPk(sellerId, {
      attributes: [
        "id",
        "name",
        "shop_name",
        "shop_image",
        "phone",
        "brand_color",
        "order_type",
        "ui_settings",
      ],
    });

    res.status(200).json({
      success: true,
      error: false,
      products,
      offers,
      seller,
    });
  } catch (error) {
    console.error("Cart products error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch cart products",
    });
  }
});

// Multer setup to save images in /uploads folder

// Route to get product details
router.get("/product/:id", detectSeller, async (req, res) => {
  try {
    const { id } = req.params;
    const { shopName } = req.query;

    const product = await ProductV2.findByPk(id, {
      attributes: PRODUCT_V2_ATTRIBUTES,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Product not found",
      });
    }

    // Validate product belongs to the requested shop (prevents cross-shop leakage)
    if (shopName) {
      const owningSeller = await SellerV2.findByPk(product.seller_id, {
        attributes: ["id", "shop_name"],
      });
      if (!owningSeller || owningSeller.shop_name !== shopName) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Product not found in this shop",
        });
      }
    }

    // Check and clean expired discount/cashback/free-delivery bundles
    await checkAndCleanProductV2Expiration([product]);

    // 👀 increase product views (skip if viewer is a seller)
    if (!req.isSeller) {
      await product.increment("views", { by: 1 });

      // 📊 REPORT LOGIC
      const today = new Date().toISOString().split("T")[0];

      const [report, created] = await Report.findOrCreate({
        where: {
          seller_id: product.seller_id,
          report_date: today,
        },
        defaults: {
          productViews: 1,
        },
      });

      // if report already exists → increment
      if (!created) {
        await report.increment("productViews", { by: 1 });
      }
    }

    res.status(200).json({
      success: true,
      error: false,
      product: normalizeProductV2(product),
      isSeller: req.isSeller,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch product",
    });
  }
});
router.post("/add-feedback", async (req, res) => {
  try {
    const { message, rating, type } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (!type || type.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Type is required",
      });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const feedback = await Feedback.create({
      message: message.trim(),
      rating: rating || null,
      type: type.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: feedback,
    });
  } catch (error) {
    console.error("Error saving feedback:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
