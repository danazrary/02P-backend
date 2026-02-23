import { Router } from "express";

import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";

import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";

const router = Router();

router.post("/add-redline", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id: sellerId } = req.user;
    const { textKu, textAr, language, start_time, end_time } = req.body;

    // Validation - check required times
    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide start_time and end_time",
      });
    }

    // Validate text based on language selection
    const lang = language || "arabic"; // default to arabic
    if (lang === "kurdish" && !textKu?.trim()) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide Kurdish text",
      });
    }
    if (lang === "arabic" && !textAr?.trim()) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide Arabic text",
      });
    }
    if (lang === "both" && (!textKu?.trim() || !textAr?.trim())) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide both Kurdish and Arabic text",
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

    // Build update object based on language selection
    const updateData = {};
    const responseData = {
      language: lang,
      start_time,
      end_time,
      created_at: new Date(),
    };

    if (lang === "kurdish") {
      // Kurdish only - save to red_line, clear red_lineAr
      updateData.red_line = {
        text: textKu.trim(),
        start_time,
        end_time,
        created_at: new Date(),
      };
      updateData.red_lineAr = null;
      responseData.textKu = textKu.trim();
    } else if (lang === "arabic") {
      // Arabic only - save to red_lineAr, clear red_line
      updateData.red_lineAr = {
        text: textAr.trim(),
        start_time,
        end_time,
        created_at: new Date(),
      };
      updateData.red_line = null;
      responseData.textAr = textAr.trim();
    } else {
      // Both - save Kurdish to red_line, Arabic to red_lineAr
      updateData.red_line = {
        text: textKu.trim(),
        start_time,
        end_time,
        created_at: new Date(),
      };
      updateData.red_lineAr = {
        text: textAr.trim(),
        start_time,
        end_time,
        created_at: new Date(),
      };
      responseData.textKu = textKu.trim();
      responseData.textAr = textAr.trim();
    }

    await seller.update(updateData);

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      data: responseData,
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

    // Delete red_line data (both columns)
    await seller.update({
      red_line: null,
      red_lineAr: null,
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
