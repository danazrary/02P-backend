import { Router } from "express";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";

const router = Router();

/**
 * GET /category-products/:sellerId
 * Public endpoint  fetch products for a shop's category page.
 * Query params:
 *   category    {string}  required category name (exact match)
 *   subcategory {string}  optional subcategory name filter
 *   limit       {number}  default 20, max 100
 *   offset      {number}  default 0
 */
router.get("/category-products/:sellerId", async (req, res) => {
  const { sellerId } = req.params;
  const rawCategory = req.query.category || "";
  const rawSubcategory = req.query.subcategory || "";
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  // LOG: incoming request
  console.log("\n========== [CATEGORY PRODUCTS] INCOMING REQUEST ==========");
  console.log(`  Method : GET`);
  console.log(`  URL    : /api/seller/category-products/${sellerId}`);
  console.log(`  Params : sellerId = "${sellerId}"`);
  console.log(`  Query  :`, {
    category: rawCategory || "(none)",
    subcategory: rawSubcategory || "(none)",
    limit,
    offset,
  });
  console.log(
    "==============================================================\n",
  );

  if (!rawCategory) {
    console.warn("[CATEGORY PRODUCTS] No category provided  returning 400");
    return res.status(400).json({
      success: false,
      message: "category query param is required",
    });
  }

  try {
    const whereClause = {
      seller_id: sellerId,
      category: rawCategory,
    };
    if (rawSubcategory) {
      whereClause.subcategory = rawSubcategory;
    }

    console.log("[CATEGORY PRODUCTS] Querying DB with where:", whereClause);
    console.log("[CATEGORY PRODUCTS] limit:", limit, "| offset:", offset);

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

    console.log(
      `[CATEGORY PRODUCTS] DB result: ${rawProducts.length} rows found (total matching: ${total})`,
    );

    const products = await checkAndCleanProductExpiration(rawProducts);

    const hasMore = offset + limit < total;

    // LOG: outgoing response
    console.log(
      "\n========== [CATEGORY PRODUCTS] OUTGOING RESPONSE ==========",
    );
    console.log(`  Success   : true`);
    console.log(`  Products  : ${products.length} items`);
    console.log(`  Total     : ${total}`);
    console.log(`  hasMore   : ${hasMore}`);
    if (products.length > 0) {
      console.log(`  First product (id=${products[0].id}):`, {
        titleKu: products[0].titleKu,
        titleAr: products[0].titleAr,
        category: products[0].category,
        subcategory: products[0].subcategory,
        hasRealPrice: products[0].hasRealPrice,
        realPrice: products[0].realPrice,
        isAvailable: products[0].isAvailable,
      });
    }
    console.log(
      "=============================================================\n",
    );

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore,
    });
  } catch (error) {
    console.error("\n[CATEGORY PRODUCTS] SERVER ERROR:", error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching category products",
    });
  }
});

export default router;

