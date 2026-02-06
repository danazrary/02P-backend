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

    const currentDate = new Date();
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    // ========== PLAN LOGIC ==========

    // 1. No plan exists - Create trial plan
    if (!sellerPlanRecord) {
      // Get trial plan (plan_id: 9)
      const trialPlan = await Plan.findByPk(9);
      const trialDays = trialPlan ? trialPlan.duration_days : 7;

      sellerPlanRecord = await SellerPlan.create({
        seller_id: id,
        plan_id: 9, // Trial plan
        start_date: new Date(),
        end_date: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
        is_trial: true,
        trial_ended: false,
        status: true,
      });
      console.log(`✅ Created trial plan for seller ${id}`);
    }

    // Get current plan details
    let sellerPlanRow = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = sellerPlanRow ? sellerPlanRow.name : "";

    // 2. If plan is "free_seller" - Check trial eligibility
    if (
      planName === "free_seller" ||
      planName === "Free" ||
      sellerPlanRecord.plan_id === 1
    ) {
      // Check if trial_ended is false - give trial
      if (!sellerPlanRecord.trial_ended) {
        const trialPlan = await Plan.findByPk(9);
        const trialDays = trialPlan ? trialPlan.duration_days : 7;

        // Update to trial plan
        await sellerPlanRecord.update({
          plan_id: 9,
          start_date: new Date(),
          end_date: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
          is_trial: true,
          status: true,
        });

        // Refresh plan data
        sellerPlanRow = await Plan.findByPk(9);
        console.log(`✅ Upgraded seller ${id} from free to trial plan`);
      }
      // If trial_ended is true, continue with free plan
    }

    // 3. Check if plan is trial_seller
    const updatedPlanName = sellerPlanRow ? sellerPlanRow.name : "";
    if (updatedPlanName === "trial_seller" || sellerPlanRecord.plan_id === 9) {
      const endDate = new Date(sellerPlanRecord.end_date);
      const timeDiff = currentDate - endDate;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (endDate < currentDate) {
        // Trial ended
        await sellerPlanRecord.update({
          trial_ended: true,
        });

        if (hoursDiff < 24) {
          // Less than 24 hours - show warning
          const hoursRemaining = Math.floor(24 - hoursDiff);
          const minutesRemaining = Math.floor(
            (24 - hoursDiff - hoursRemaining) * 60,
          );

          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: false,
            plan_warning: true,
            warning_type: "trial_expired",
            hours_remaining: hoursRemaining,
            minutes_remaining: minutesRemaining,
            message:
              "Your trial period has ended. Renew within 24 hours or your shop will close.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
            products: [],
            offers: [],
          });
        } else if (daysDiff <= 16) {
          // 1 day to 16 days - shop is closed, show days until deletion
          await sellerPlanRecord.update({ status: false });
          const daysUntilDeletion = Math.floor(16 - daysDiff);

          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: true,
            closeReason: "trial_expired",
            days_until_deletion: daysUntilDeletion,
            message:
              "Your shop is closed. Renew your plan or your data will be deleted.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
          });
        } else {
          // More than 16 days - data should be deleted (handled by admin cleanup)
          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: true,
            closeReason: "trial_expired_deleted",
            days_until_deletion: 0,
            message: "Your trial has expired and grace period has passed.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
          });
        }
      }
      // Trial not ended yet - continue
    }

    // 4. Check paid plans (not free_seller or trial_seller)
    if (
      updatedPlanName !== "free_seller" &&
      updatedPlanName !== "Free" &&
      updatedPlanName !== "trial_seller" &&
      sellerPlanRecord.plan_id !== 1 &&
      sellerPlanRecord.plan_id !== 9
    ) {
      const endDate = new Date(sellerPlanRecord.end_date);
      const timeDiff = currentDate - endDate;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (endDate < currentDate) {
        // Plan expired
        if (hoursDiff < 24) {
          // Less than 24 hours - show warning
          const hoursRemaining = Math.floor(24 - hoursDiff);
          const minutesRemaining = Math.floor(
            (24 - hoursDiff - hoursRemaining) * 60,
          );

          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: false,
            plan_warning: true,
            warning_type: "plan_expired",
            hours_remaining: hoursRemaining,
            minutes_remaining: minutesRemaining,
            message:
              "Your plan has expired. Renew within 24 hours or your shop will close.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
            products: [],
            offers: [],
          });
        } else if (daysDiff <= 16) {
          // 1 day to 16 days - shop is closed, show days until deletion
          await sellerPlanRecord.update({ status: false });
          const daysUntilDeletion = Math.floor(16 - daysDiff);

          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: true,
            closeReason: "plan_expired",
            days_until_deletion: daysUntilDeletion,
            message:
              "Your shop is closed. Renew your plan or your data will be deleted.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
          });
        } else {
          // More than 16 days - data should be deleted (handled by admin cleanup)
          return res.status(200).json({
            success: true,
            error: false,
            logout: false,
            yourShopClose: true,
            closeReason: "plan_expired_deleted",
            days_until_deletion: 0,
            message: "Your plan has expired and grace period has passed.",
            seller_id: id,
            plan_id: sellerPlanRecord.plan_id,
            sellerPlan: updatedPlanName,
            plan_end_date: sellerPlanRecord.end_date,
          });
        }
      }
    }

    // ========== END PLAN LOGIC ==========

    // 🔹 Check product and offer limits
    const maxProducts = sellerPlanRow ? sellerPlanRow.max_products : 0;
    const maxOffers = sellerPlanRow ? sellerPlanRow.max_offers : 0;
    const currentProductCount = await Product.count({
      where: { seller_id: id },
    });
    const currentOfferCount = await SellerOffer.count({
      where: { seller_id: id, is_active: true },
    });

    const product_limit_reached = currentProductCount >= maxProducts;
    const offer_limit_reached = currentOfferCount >= maxOffers;

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
      yourShopClose: false,
      seller_id: id,
      plan_id: sellerPlanRecord ? sellerPlanRecord.plan_id : null,
      is_trial: sellerPlanRecord ? sellerPlanRecord.is_trial : false,
      trial_ended: sellerPlanRecord ? sellerPlanRecord.trial_ended : false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      plan_start_date: sellerPlanRecord ? sellerPlanRecord.start_date : null,
      plan_end_date: sellerPlanRecord ? sellerPlanRecord.end_date : null,
      red_line: redLine,
      products,
      offers,
      product_limit_reached,
      offer_limit_reached,
      max_products: maxProducts,
      max_offers: maxOffers,
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
