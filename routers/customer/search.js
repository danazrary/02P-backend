import { Router } from "express";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import ProductImage from "../../database/productImages.js";
import { Op } from "sequelize";
import sequelize from "../../database/sequelize.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/customer/search
// Query: q, shopName, type, hasDiscount, freeDelivery, sort, limit, offset
// ---------------------------------------------------------------------------
router.get("/search", async (req, res) => {
  try {
    const {
      q = "",
      shopName,
      type = "products",
      hasDiscount,
      freeDelivery,
      sort = "relevance",
      limit = 15,
      offset = 0,
      category,
    } = req.query;

    if (!shopName) {
      return res
        .status(400)
        .json({ success: false, message: "shopName is required" });
    }

    const searchLimit = Math.min(parseInt(limit) || 20, 50);
    const searchOffset = Math.max(parseInt(offset) || 0, 0);

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
      attributes: ["id"],
    });

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Shop not found" });
    }

    const sellerId = seller.id;
    const trimmedQ = q.trim();

    // ── Categories type: return distinct categories matching query ──
    if (type === "categories") {
      const catWhere = { seller_id: sellerId };
      if (trimmedQ.length >= 2) {
        catWhere.category = { [Op.like]: `%${trimmedQ}%` };
      }

      const rows = await Product.findAll({
        where: catWhere,
        attributes: [
          [sequelize.fn("DISTINCT", sequelize.col("category")), "category"],
        ],
        raw: true,
      });

      return res.json({
        success: true,
        type: "categories",
        results: rows.filter((r) => r.category).map((r) => r.category),
        total: rows.length,
        hasMore: false,
      });
    }

    // ── Products type ──
    const where = { seller_id: sellerId };

    if (trimmedQ.length >= 2) {
      const pattern = `%${trimmedQ}%`;
      where[Op.or] = [
        { titleKu: { [Op.like]: pattern } },
        { titleAr: { [Op.like]: pattern } },
        { descriptionKu: { [Op.like]: pattern } },
        { descriptionAr: { [Op.like]: pattern } },
      ];
    }

    if (hasDiscount === "true") where.hasDiscount = true;
    if (freeDelivery === "true") where.free_delivery = true;
    if (category) where.category = category;

    let order;
    switch (sort) {
      case "low":
        order = [["realPrice", "ASC"]];
        break;
      case "high":
        order = [["realPrice", "DESC"]];
        break;
      case "newest":
        order = [["createdAt", "DESC"]];
        break;
      default:
        // relevance: sort by views desc when no text query, otherwise DB order
        order = trimmedQ.length >= 2 ? [] : [["views", "DESC"]];
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      attributes: [
        "id",
        "language",
        "titleKu",
        "titleAr",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discount_percent",
        "discountType",
        "discountEndDate",
        "free_delivery",
        "hasRealPrice",
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "category",
        "subcategory",
        "views",
        "createdAt",
      ],
      order,
      limit: searchLimit,
      offset: searchOffset,
      distinct: true,
    });

    const cleaned = await checkAndCleanProductExpiration(rows);

    return res.json({
      success: true,
      type: "products",
      results: cleaned,
      total: count,
      hasMore: searchOffset + searchLimit < count,
    });
  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ success: false, message: "Search failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/customer/search/suggestions
// Fast title-only suggestions for live dropdown
// Query: q, shopName
// ---------------------------------------------------------------------------
router.get("/search/suggestions", async (req, res) => {
  try {
    const { q = "", shopName } = req.query;

    if (!shopName || q.trim().length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
      attributes: ["id"],
    });

    if (!seller) return res.json({ success: true, suggestions: [] });

    const pattern = `%${q.trim()}%`;

    const products = await Product.findAll({
      where: {
        seller_id: seller.id,
        [Op.or]: [
          { titleKu: { [Op.like]: pattern } },
          { titleAr: { [Op.like]: pattern } },
        ],
      },
      attributes: ["id", "titleKu", "titleAr", "category"],
      order: [["views", "DESC"]],
      limit: 8,
    });

    return res.json({
      success: true,
      suggestions: products.map((p) => ({
        id: p.id,
        titleKu: p.titleKu,
        titleAr: p.titleAr,
        category: p.category,
      })),
    });
  } catch (err) {
    console.error("Suggestions error:", err);
    return res.json({ success: true, suggestions: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/customer/search/trending
// Most viewed products in a shop
// Query: shopName
// ---------------------------------------------------------------------------
router.get("/search/trending", async (req, res) => {
  try {
    const { shopName } = req.query;

    if (!shopName) return res.json({ success: true, trending: [] });

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
      attributes: ["id"],
    });

    if (!seller) return res.json({ success: true, trending: [] });

    const products = await Product.findAll({
      where: { seller_id: seller.id },
      attributes: ["id", "titleKu", "titleAr", "views"],
      order: [["views", "DESC"]],
      limit: 10,
    });

    return res.json({
      success: true,
      trending: products.map((p) => ({
        id: p.id,
        titleKu: p.titleKu,
        titleAr: p.titleAr,
      })),
    });
  } catch (err) {
    console.error("Trending error:", err);
    return res.json({ success: true, trending: [] });
  }
});

export default router;
