import { Router } from "express";

import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";

import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  parseDateToUTC,
  getCurrentTimeBaghdad,
  formatRedLineForStorage,
  formatRedLineResponse,
} from "../../utils/timezoneHandler.js";

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

    // Check if plan has expired (use Baghdad timezone)
    const { baghdadFull: currentBaghdad } = getCurrentTimeBaghdad();
    const endDateParsed = parseDateToUTC(sellerPlan.end_date);
    if (
      endDateParsed &&
      currentBaghdad.isAfter(endDateParsed.dayjsObj.tz("Asia/Baghdad"))
    ) {
      return res.status(403).json({
        success: false,
        error: true,
        plan_expired: true,
        message: "Your plan has expired. Please renew your plan to continue.",
      });
    }

    // Validate and parse start_time and end_time
    const startParsed = parseDateToUTC(start_time);
    const endParsed = parseDateToUTC(end_time);

    if (!startParsed || !endParsed) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Invalid date format for start_time or end_time",
      });
    }

    // Validate that start_time is before end_time
    if (startParsed.dayjsObj.isAfter(endParsed.dayjsObj)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "start_time must be before end_time",
      });
    }

    // Build update object based on language selection
    // Store dates in UTC ISO format
    const updateData = {};
    const { utc: createdAt } = getCurrentTimeBaghdad();

    if (lang === "kurdish") {
      // Kurdish only - save to red_line, clear red_lineAr
      updateData.red_line = {
        text: textKu.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
      updateData.red_lineAr = null;
    } else if (lang === "arabic") {
      // Arabic only - save to red_lineAr, clear red_line
      updateData.red_lineAr = {
        text: textAr.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
      updateData.red_line = null;
    } else {
      // Both - save Kurdish to red_line, Arabic to red_lineAr
      updateData.red_line = {
        text: textKu.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
      updateData.red_lineAr = {
        text: textAr.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
    }

    await seller.update(updateData);

    // Build response with formatted dates
    const responseData = {
      language: lang,
      start_time_utc: startParsed.utc,
      start_time_display: startParsed.baghdad,
      end_time_utc: endParsed.utc,
      end_time_display: endParsed.baghdad,
      created_at: createdAt,
    };

    if (lang === "kurdish" || lang === "both") {
      responseData.textKu = textKu.trim();
    }
    if (lang === "arabic" || lang === "both") {
      responseData.textAr = textAr.trim();
    }

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      data: responseData,
    });
  } catch (error) {
    console.error("Error adding red line:", error);
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
    console.error("Error deleting red line:", error);
    return res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

export default router;
