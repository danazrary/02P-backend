import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import ProductImage from "../../database/productImages.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
import {
  processRedLineData,
  getRedLineStatus,
  toUTC,
} from "../../utils/timezoneHandler.js";
import { Op } from "sequelize";
const router = Router();

function isNewDay(lastVisit) {
  const last = new Date(lastVisit).toDateString();
  const today = new Date().toDateString();
  return last !== today;
}

const ONE_HOUR = 60 * 60 * 1000;

function canCountAgain(lastVisit) {
  return Date.now() - lastVisit >= ONE_HOUR;
}

router.get("/:shopName", detectSeller, async (req, res) => {
  try {
    const { shopName } = req.params;

    const seller = await Seller.findOne({ where: { shop_name: shopName } });
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }
    const sellerId = seller.id;
    const today = new Date().toISOString().split("T")[0];

    // 🍪 COOKIE NAME
    const visitCookieName = `shop_visit_${sellerId}`;
    const lastVisit = req.cookies?.[visitCookieName];

    let shouldIncrease = false;

    if (!req.isSeller) {
      if (!lastVisit) {
        shouldIncrease = true;
      } else if (isNewDay(Number(lastVisit))) {
        shouldIncrease = true;
      }
    }

    if (shouldIncrease) {
      // 📊 REPORT
      const [report, created] = await Report.findOrCreate({
        where: {
          seller_id: sellerId,
          report_date: today,
        },
        defaults: {
          shopVisitors: 1,
        },
      });

      if (!created) {
        await report.increment("shopVisitors", { by: 1 });
      }

      // 🍪 Save/update cookie
      const visitCookieOpts = {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      };
      if (process.env.NODE_ENV === "production") {
        visitCookieOpts.domain = `.${process.env.BASE_DOMAIN || "dwkanlink.com"}`;
      }
      res.cookie(visitCookieName, Date.now(), visitCookieOpts);
    }

    // 🔹 SELLER PLAN
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: sellerId,
        plan_id: 1,
        start_date: toUTC(new Date()),
        end_date: toUTC(new Date("2099-12-31")),
        is_trial: false,
        trial_ended: false,
        status: true,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.plan_id);

    // 🎯 Fetch all active offers
    const offers = await SellerOffer.findAll({
      where: { seller_id: sellerId, is_active: true },
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

    let products = await Product.findAll({
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
        "sizes",
      ],
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    // ────────────────────────────────────────────────────────────
    // Build combined redLine from both Kurdish (red_line) and Arabic (red_lineAr)
    // Use Baghdad timezone for status determination
    // ────────────────────────────────────────────────────────────
    let redLine = null;
    const kuResult = processRedLineData(seller.red_line);
    const arResult = processRedLineData(seller.red_lineAr);

    if (kuResult.data || arResult.data) {
      let language = "both";
      if (kuResult.data && !arResult.data) language = "kurdish";
      else if (!kuResult.data && arResult.data) language = "arabic";

      const kuStatus = kuResult.data
        ? getRedLineStatus(kuResult.data.start_time, kuResult.data.end_time)
        : null;
      const arStatus = arResult.data
        ? getRedLineStatus(arResult.data.start_time, arResult.data.end_time)
        : null;

      redLine = {
        textKu: kuResult.data?.text || "",
        textAr: arResult.data?.text || "",
        language,
        start_time: kuResult.data?.start_time || arResult.data?.start_time,
        end_time: kuResult.data?.end_time || arResult.data?.end_time,
        status: kuStatus || arStatus, // "coming_soon" | "active" | "expired"
      };
    }

    res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      red_line: redLine,
      brand_color: seller.brand_color || null,
      offers,
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

// Search products in a shop
router.get("/:shopName/search", async (req, res) => {
  try {
    const { shopName } = req.params;
    const { q, filter = "title" } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
        message: "No search query provided",
      });
    }

    const seller = await Seller.findOne({ where: { shop_name: shopName } });
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    const searchTerm = q.trim();

    // Build search conditions based on filter
    let searchConditions;
    if (filter === "description") {
      // Search only in descriptions
      searchConditions = [
        { descriptionKu: { [Op.like]: `%${searchTerm}%` } },
        { descriptionAr: { [Op.like]: `%${searchTerm}%` } },
      ];
    } else {
      // Search in titles (default) - also includes descriptions for more results
      searchConditions = [
        { titleKu: { [Op.like]: `%${searchTerm}%` } },
        { titleAr: { [Op.like]: `%${searchTerm}%` } },
        { descriptionKu: { [Op.like]: `%${searchTerm}%` } },
        { descriptionAr: { [Op.like]: `%${searchTerm}%` } },
      ];
    }

    let products = await Product.findAll({
      where: {
        seller_id: seller.id,
        [Op.or]: searchConditions,
      },
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
        "sizes",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      limit: 50,
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    res.status(200).json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
