import { Router } from "express";

import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";

import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";

const router = Router();

router.post("/add-redline", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id: sellerId } = req.user;
    const { text, start_time, end_time } = req.body;

    // Validation
    if (!text || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide text, start_time, and end_time",
      });
    }

    /* -------------------- Seller -------------------- */
    const seller = await Seller.findByPk(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    /* -------------------- Plan Validation -------------------- */
    // Check seller plan
    const sellerPlan = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlan) {
      return res.status(403).json({
        success: false,
        error: true,
        message: "No plan found for this seller",
      });
    }

    const plan = await Plan.findByPk(sellerPlan.plan_id);

    // Check if free plan - don't allow adding red line
    if (
      sellerPlan.plan_id === 1 ||
      plan?.name === "free_seller" ||
      plan?.name === "Free"
    ) {
      return res.status(403).json({
        success: false,
        error: true,
        free_plan: true,
        message: "Free plan cannot add red line. Please upgrade your plan.",
      });
    }

    // Check if plan has expired
    const currentDate = new Date();
    if (sellerPlan.end_date && new Date(sellerPlan.end_date) < currentDate) {
      return res.status(403).json({
        success: false,
        error: true,
        plan_expired: true,
        message: "Your plan has expired. Please renew your plan to continue.",
      });
    }

    // Update or create red_line data
    const redLineData = {
      text: text.trim(),
      start_time,
      end_time,
      created_at: new Date(),
    };

    await seller.update({
      red_line: redLineData,
    });

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      data: redLineData,
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

router.delete("/delete-redline", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id: sellerId } = req.user;

    /* -------------------- Seller -------------------- */
    const seller = await Seller.findByPk(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    // Delete red_line data
    await seller.update({
      red_line: null,
    });

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
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
