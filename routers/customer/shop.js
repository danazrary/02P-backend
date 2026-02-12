import { Router } from "express";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
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
    console.log(
      "Cookies:",
      req.cookies,
      req.cookies?.[`shop_visit_${seller.id}`],
    );
    const sellerId = seller.id;
    const today = new Date().toISOString().split("T")[0];
    console.log("Today:", today);

    // 🍪 COOKIE NAME
    const visitCookieName = `shop_visit_${sellerId}`;
    const lastVisit = req.cookies?.[visitCookieName];
    console.log("aaa", visitCookieName, lastVisit);

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
        starts_at: new Date(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        is_trial: false,
        is_active: false,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.id);

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

    res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      red_line: seller.red_line || null,
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

export default router;
