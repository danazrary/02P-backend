// backend/routes/seller/categoryProducts.js
import { Router } from "express";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";

const router = Router();

router.get("/category-products/:sellerId", async (req, res) => {
  const { sellerId } = req.params;
  const rawCategory = req.query.category || "";
  const rawSubcategory = req.query.subcategory || "";
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  if (!rawCategory) {
    return res.status(400).json({
      success: false,
      message: "category query param is required",
    });
  }

  try {
    const whereClause = {
      seller_id: Number(sellerId),
      category: rawCategory,
    };
    if (rawSubcategory) {
      whereClause.subcategory = rawSubcategory;
    }

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
      where: whereClause,
      attributes: [
        "id",
        "hasRealPrice",
        "language",
        "titleKu",
        "titleAr",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discount_percent",
        "discountType",
        "discountStartDate",
        "discountEndDate",
        "freeDeliveryStartDate",
        "freeDeliveryEndDate",
        "free_delivery",
        "hasCashback",
        "cashbackType",
        "cashbackValue",
        "cashbackStartDate",
        "cashbackEndDate",
        "cashbackMinOrderAmount",
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "colors",
        "sizes",
        "stock",
        "isAvailable",
        "category",
        "subcategory",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
    });

    const products = await checkAndCleanProductExpiration(rawProducts);
    const hasMore = offset + limit < total;

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore,
    });
  } catch (error) {
    console.error("[CATEGORY PRODUCTS] SERVER ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching category products",
    });
  }
});

export default router;
