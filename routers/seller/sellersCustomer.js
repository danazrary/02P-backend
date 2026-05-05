import { Router } from "express";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import ProductImage from "../../database/productImages.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
import {
  processRedLineData,
  getRedLineStatus,
  getCurrentTimeBaghdad,
} from "../../utils/timezoneHandler.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);
const router = Router();

router.get("/sellers-customer/:shopName", detectSeller, async (req, res) => {
  try {
    const { shopName } = req.params;
    let role = false; // default role
    let sellerShop;
    // 1️⃣ Check if requester is a seller
    if (req.isSeller && req.seller) {
      const findSeller = await Seller.findByPk(req.seller.id, {
        attributes: ["shop_name"],
      });

      role = true; // update role if seller
      sellerShop = findSeller ? findSeller.shop_name : null;
      /* return res.status(200).json({
        success: true,
        error: false,
        isSeller: true,
        shopName: findSeller ? findSeller.shop_name : null,
        message: "You are a seller. Redirect to seller dashboard.",
      }); */
    }

    // 2️⃣ Find seller by shop_name
    const seller = await Seller.findOne({
      where: { shop_name: shopName },
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        isSeller: role, // return true if requester is a seller, false otherwise
        shopName: sellerShop || null,
        message: "Seller shop not found",
      });
    }

    const sellerId = seller.id;
    const { utc: currentTimeUTC } = getCurrentTimeBaghdad();

    // 3️⃣ Get seller plan
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    // If no plan exists, shop is closed
    if (!sellerPlanRecord) {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: role,
        shopName: sellerShop || null,
        yourShopClose: true,
        closeReason: "no_plan",
        message: "This shop is currently closed",
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
        },
      });
    }

    // Get plan details
    const plan = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = plan ? plan.name : "";

    // Check if plan is free_seller - shop is closed for customers
    if (
      planName === "free_seller" ||
      planName === "Free" ||
      sellerPlanRecord.plan_id === 1
    ) {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: role,
        shopName: sellerShop || null,
        yourShopClose: true,
        closeReason: "free_plan",
        message: "This shop is currently closed",
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
        },
      });
    }

    // Check if plan is trial_seller (use Baghdad timezone)
    if (planName === "trial_seller" || sellerPlanRecord.plan_id === 9) {
      const { baghdadFull: currentBaghdad } = getCurrentTimeBaghdad();
      const endDateBaghdad = dayjs(sellerPlanRecord.end_date).tz(
        "Asia/Baghdad",
      );
      const daysDiff = currentBaghdad.diff(endDateBaghdad, "day");

      // If trial ended more than 1 day ago, shop is closed
      if (currentBaghdad.isAfter(endDateBaghdad) && daysDiff > 1) {
        return res.status(200).json({
          success: true,
          error: false,
          isSeller: role,
          shopName: sellerShop || null,
          yourShopClose: true,
          closeReason: "trial_expired",
          message: "This shop is currently closed",
          seller: {
            id: seller.id,
            name: seller.name,
            shop_name: seller.shop_name,
            shop_image: seller.shop_image,
          },
        });
      }
    }

    // Check paid plans - if expired more than 1 day, shop is closed (use Baghdad timezone)
    if (
      planName !== "free_seller" &&
      planName !== "Free" &&
      planName !== "trial_seller" &&
      sellerPlanRecord.plan_id !== 1 &&
      sellerPlanRecord.plan_id !== 9
    ) {
      const { baghdadFull: currentBaghdad } = getCurrentTimeBaghdad();
      const endDateBaghdad = dayjs(sellerPlanRecord.end_date).tz(
        "Asia/Baghdad",
      );
      const daysDiff = currentBaghdad.diff(endDateBaghdad, "day");

      if (currentBaghdad.isAfter(endDateBaghdad) && daysDiff > 1) {
        return res.status(200).json({
          success: true,
          error: false,
          isSeller: role,
          shopName: sellerShop || null,
          yourShopClose: true,
          closeReason: "plan_expired",
          message: "This shop is currently closed",
          seller: {
            id: seller.id,
            name: seller.name,
            shop_name: seller.shop_name,
            shop_image: seller.shop_image,
          },
        });
      }
    }

    // 5️⃣ Get all seller offers (only active ones)
    const allOffers = await SellerOffer.findAll({
      where: {
        seller_id: sellerId,
        is_active: true,
        type_offer: {
          [Op.ne]: "discount_delivery", // 👈 exclude this type
        },
      },
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "cover_image",
        "type_offer",
        "start_date",
        "end_date",
        "language",
        "discount_price_type",
        "discount_price",
        "discount_percent",
        "discount_or_free_delivery",
      ],
    });

    // Filter and delete expired or not-yet-started offers (use Baghdad timezone)
    const { baghdadFull: currentBaghdad } = getCurrentTimeBaghdad();
    const offers = [];
    for (const offer of allOffers) {
      const startDateBaghdad = dayjs(offer.start_date).tz("Asia/Baghdad");
      const endDateBaghdad = dayjs(offer.end_date).tz("Asia/Baghdad");

      if (currentBaghdad.isAfter(endDateBaghdad)) {
        // Delete expired offer from database
        await SellerOffer.destroy({
          where: { id: offer.id },
        });
      } else if (
        (currentBaghdad.isSame(startDateBaghdad) ||
          currentBaghdad.isAfter(startDateBaghdad)) &&
        (currentBaghdad.isSame(endDateBaghdad) ||
          currentBaghdad.isBefore(endDateBaghdad))
      ) {
        // Only show offers that have started and haven't ended
        offers.push(offer);
      }
    }

    // 6️⃣ Get seller products (paginated)
    const productLimit = Math.min(parseInt(req.query.productLimit) || 30, 100);
    const productOffset = parseInt(req.query.productOffset) || 0;

    const { count: totalProducts, rows: rawProducts } =
      await Product.findAndCountAll({
        where: { seller_id: sellerId },
        attributes: [
          "id",
          "hasRealPrice",
          "language",
          "titleKu",
          "titleAr",
          "images",
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
          "variantPrices",
          "variantPricesAr",
          "colors",
          "category",
          "subcategory",
        ],
        include: [
          {
            model: ProductImage,
            as: "productImages",
            attributes: ["image_key", "is_main"],
          },
        ],
        limit: productLimit,
        offset: productOffset,
        order: [["id", "DESC"]],
      });

    // Check and clean expired discounts and free delivery
    let products = await checkAndCleanProductExpiration(rawProducts);
    const hasMoreProducts = productOffset + productLimit < totalProducts;

    // ────────────────────────────────────────────────────────────
    // Check red_line (Kurdish) and red_lineAr (Arabic) - Baghdad TZ
    // ────────────────────────────────────────────────────────────
    let redLineKu = null;
    let redLineAr = null;
    let needsCleanup = { ku: false, ar: false };

    // Process Kurdish red_line
    if (seller.red_line) {
      const kuResult = processRedLineData(seller.red_line);
      redLineKu = kuResult.data;
      needsCleanup.ku = kuResult.needsCleanup;

      if (kuResult.needsCleanup) {
        console.log(
          `🗑️ Marked expired red_line (Kurdish) for seller ${sellerId}`,
        );
      }
    }

    // Process Arabic red_lineAr
    if (seller.red_lineAr) {
      const arResult = processRedLineData(seller.red_lineAr);
      redLineAr = arResult.data;
      needsCleanup.ar = arResult.needsCleanup;

      if (arResult.needsCleanup) {
        console.log(
          `🗑️ Marked expired red_lineAr (Arabic) for seller ${sellerId}`,
        );
      }
    }

    // Cleanup expired/invalid data from database
    if (needsCleanup.ku || needsCleanup.ar) {
      const updateObj = {};
      if (needsCleanup.ku) updateObj.red_line = null;
      if (needsCleanup.ar) updateObj.red_lineAr = null;
      await Seller.update(updateObj, { where: { id: sellerId } });
    }

    // Build combined redLine response with status
    let redLine = null;
    if (redLineKu || redLineAr) {
      let language = "both";
      if (redLineKu && !redLineAr) language = "kurdish";
      else if (!redLineKu && redLineAr) language = "arabic";

      const kuStatus = redLineKu
        ? getRedLineStatus(redLineKu.start_time, redLineKu.end_time)
        : null;
      const arStatus = redLineAr
        ? getRedLineStatus(redLineAr.start_time, redLineAr.end_time)
        : null;

      redLine = {
        textKu: redLineKu?.text || "",
        textAr: redLineAr?.text || "",
        language,
        start_time: redLineKu?.start_time || redLineAr?.start_time,
        end_time: redLineKu?.end_time || redLineAr?.end_time,
        status: kuStatus || arStatus, // "coming_soon" | "active" | "expired"
      };
    }

    // 7️⃣ Return complete seller data
    res.status(200).json({
      success: true,
      error: false,
      isSeller: role,
      shopName: sellerShop || null,
      yourShopClose: false,
      seller: {
        id: seller.id,
        name: seller.name,
        shop_name: seller.shop_name,
        shop_image: seller.shop_image,
        bio: seller.bio || null,
        shop_location: seller.shop_location || null,
      },
      default_shop_lang: seller.default_shop_lang || "ku",
      sellerPlan: plan ? plan.name : "Free",
      brand_color: seller.brand_color || null,
      categories: seller.categories || [],
      subcategories_map: seller.subcategories_map || {},
      category_images: seller.category_images || {},
      products,
      totalProducts,
      hasMoreProducts,
      offers,
      red_line: redLine,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      isSeller: role,
      shopName: sellerShop || null,
      message: "Server error",
    });
  }
});

/**
 * Lightweight endpoint to load more products for a seller (pagination)
 * Used by both home page and dashboard "Load More" buttons
 */
router.get("/more-products/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
      where: { seller_id: sellerId },
      attributes: [
        "id",
        "hasRealPrice",
        "language",
        "titleKu",
        "titleAr",
        "images",
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
        "variantPrices",
        "variantPricesAr",
        "colors",
        "category",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
    });

    const products = await checkAndCleanProductExpiration(rawProducts);

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Error loading more products:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/**
 * GET /products-by-category/:sellerId
 * Fetch products filtered by category for a seller's shop
 * Query params: category, limit, offset
 */
router.get("/products-by-category/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { category } = req.query;

    const whereClause = { seller_id: sellerId };
    if (category) {
      whereClause.category = category;
    }

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
      where: whereClause,
      attributes: [
        "id",
        "hasRealPrice",
        "language",
        "titleKu",
        "titleAr",
        "images",
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
        "variantPrices",
        "variantPricesAr",
        "colors",
        "category",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
    });

    const products = await checkAndCleanProductExpiration(rawProducts);

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Error loading products by category:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/**
 * GET /shop-discounts/:shopName
 * Public endpoint to fetch products with discounts or free delivery for a shop.
 * Categorizes into: expiringSoon (<24h), both, discountOnly, freeDeliveryOnly
 * Query params:
 *   type: "all" | "expiring_soon" | "both" | "discount_only" | "free_delivery_only"
 *   limit: number (default 5, max 50)
 *   offset: number (default 0) — used when type != "all"
 */
router.get("/shop-discounts/:shopName", async (req, res) => {
  try {
    const { shopName } = req.params;
    const type = req.query.type || "all";
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
      attributes: ["id"],
    });

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Shop not found" });
    }

    const PRODUCT_ATTRS = [
      "id",
      "hasRealPrice",
      "language",
      "titleKu",
      "titleAr",
      "images",
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
      "variantPrices",
      "variantPricesAr",
      "colors",
      "sizes",
      "category",
      "subcategory",
    ];

    // Fetch all products that have any discount or free delivery active
    const rawProducts = await Product.findAll({
      where: {
        seller_id: seller.id,
        [Op.or]: [{ hasDiscount: true }, { free_delivery: true }],
      },
      attributes: PRODUCT_ATTRS,
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      order: [["id", "DESC"]],
    });

    // Clean expired discounts / free delivery
    const products = await checkAndCleanProductExpiration(rawProducts);

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const isExpiringSoon = (p) => {
      const discountExpiring =
        p.hasDiscount &&
        p.discountType === "timer" &&
        p.discountEndDate &&
        new Date(p.discountEndDate) >= now &&
        new Date(p.discountEndDate) <= in24Hours;
      const deliveryExpiring =
        p.free_delivery &&
        p.freeDeliveryEndDate &&
        new Date(p.freeDeliveryEndDate) >= now &&
        new Date(p.freeDeliveryEndDate) <= in24Hours;
      return discountExpiring || deliveryExpiring;
    };

    const expiringSoon = [];
    const both = [];
    const discountOnly = [];
    const freeDeliveryOnly = [];

    for (const p of products) {
      if (!p.hasDiscount && !p.free_delivery) continue; // cleaned-up product
      if (isExpiringSoon(p)) {
        expiringSoon.push(p);
      } else if (p.hasDiscount && p.free_delivery) {
        both.push(p);
      } else if (p.hasDiscount) {
        discountOnly.push(p);
      } else if (p.free_delivery) {
        freeDeliveryOnly.push(p);
      }
    }

    if (type === "all") {
      return res.status(200).json({
        success: true,
        expiringSoon: expiringSoon.slice(0, limit),
        expiringSoonTotal: expiringSoon.length,
        both: both.slice(0, limit),
        bothTotal: both.length,
        discountOnly: discountOnly.slice(0, limit),
        discountOnlyTotal: discountOnly.length,
        freeDeliveryOnly: freeDeliveryOnly.slice(0, limit),
        freeDeliveryOnlyTotal: freeDeliveryOnly.length,
      });
    }

    // Single-type paginated response
    const listMap = {
      expiring_soon: expiringSoon,
      both,
      discount_only: discountOnly,
      free_delivery_only: freeDeliveryOnly,
    };
    const list = listMap[type] || [];
    const paginated = list.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      products: paginated,
      total: list.length,
      hasMore: offset + limit < list.length,
    });
  } catch (err) {
    console.error("[shop-discounts]", err);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

export default router;
