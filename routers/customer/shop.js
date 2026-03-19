import { Router } from "express";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
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

router.get("/:shopName", async (req, res) => {
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

    if (!lastVisit) {
      shouldIncrease = true;
    } else if (isNewDay(Number(lastVisit))) {
      shouldIncrease = true;
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
      res.cookie(visitCookieName, Date.now(), {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        path: "/", // 🔥 IMPORTANT
      });
    }

    // 🔹 SELLER PLAN
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: sellerId,
        plan_id: 1,
        start_date: new Date(),
        end_date: new Date("2099-12-31"),
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
      ],
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    // Build combined redLine from both Kurdish (red_line) and Arabic (red_lineAr)
    let redLine = null;
    const redLineKu = seller.red_line
      ? typeof seller.red_line === "string"
        ? JSON.parse(seller.red_line)
        : seller.red_line
      : null;
    const redLineAr = seller.red_lineAr
      ? typeof seller.red_lineAr === "string"
        ? JSON.parse(seller.red_lineAr)
        : seller.red_lineAr
      : null;

    if (redLineKu || redLineAr) {
      let language = "both";
      if (redLineKu && !redLineAr) language = "kurdish";
      else if (!redLineKu && redLineAr) language = "arabic";

      redLine = {
        textKu: redLineKu?.text || "",
        textAr: redLineAr?.text || "",
        language,
        start_time: redLineKu?.start_time || redLineAr?.start_time,
        end_time: redLineKu?.end_time || redLineAr?.end_time,
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
