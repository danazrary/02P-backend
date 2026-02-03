import { Router } from "express";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import SellerOffer from "../../database/sellerOffer.js";
const router = Router();

router.get("/dashboard", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;

    const seller = await Seller.findByPk(id);

    if (!seller) {
      res.clearCookie("s_t", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: id,
        plan_id: 1, // Free plan
        start_date: new Date(),
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        is_trial: false,
        is_active: false,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.plan_id);

    // 🔹 get plan name
    // const plan = await Plan.findByPk(sellerPlanRow.plan_id);

    const currentDate = new Date();

    // 🔹 Check product and offer limits
    const maxProducts = sellerPlanRow ? sellerPlanRow.max_products : 0;
    const currentProductCount = await Product.count({
      where: { seller_id: id },
    });
    const currentOfferCount = await SellerOffer.count({
      where: { seller_id: id, is_active: true },
    });

    const product_limit_reached = currentProductCount >= maxProducts;
    const offer_limit_reached = currentOfferCount >= maxProducts;

    // Get all active offers
    const allOffers = await SellerOffer.findAll({
      where: { seller_id: id, is_active: true },
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

    // Filter and delete expired offers
    const offers = [];
    for (const offer of allOffers) {
      const endDate = new Date(offer.end_date);
      if (endDate >= currentDate) {
        offers.push(offer);
      } else {
        // Delete expired offer from database
        await SellerOffer.destroy({
          where: { id: offer.id },
        });
        console.log(`🗑️ Deleted expired offer ${offer.id}`);
      }
    }

    const products = await Product.findAll({
      where: { seller_id: id },
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
        "free_delivery",
        "variantPrices",
      ],
    });

    // Check red_line expiration and remove if expired
    let redLine = null;
    if (seller.red_line) {
      try {
        const redLineData =
          typeof seller.red_line === "string"
            ? JSON.parse(seller.red_line)
            : seller.red_line;

        // Check if red_line has proper structure
        if (
          redLineData &&
          typeof redLineData === "object" &&
          redLineData.end_time
        ) {
          const endTime = new Date(redLineData.end_time);

          // If expired, remove from database immediately
          if (endTime < currentDate) {
            await Seller.update({ red_line: null }, { where: { id: id } });
            console.log(`🗑️ Removed expired red_line for seller ${id}`);
          } else {
            // Still valid, return it
            redLine = redLineData;
          }
        } else {
          // Invalid structure, remove it
          await Seller.update({ red_line: null }, { where: { id: id } });
        }
      } catch (error) {
        console.error("Error parsing red_line for seller", id, ":", error);
        // If parsing fails, remove invalid data
        await Seller.update({ red_line: null }, { where: { id: id } });
      }
    }

    res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      red_line: redLine,
      products,
      offers,
      product_limit_reached,
      offer_limit_reached,
      max_products: maxProducts,
      current_product_count: currentProductCount,
      current_offer_count: currentOfferCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

export default router;
