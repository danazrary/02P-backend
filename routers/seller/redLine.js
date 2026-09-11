// backend/routes/seller/redLine.js
import { Router } from "express";
import SellerV2 from "../../database/sellerv2.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  parseDateToUTC,
  getCurrentTimeBaghdad,
} from "../../utils/timezoneHandler.js";

const router = Router();

router.post("/add-redline", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.seller_id;
    const { textKu, textAr, language, start_time, end_time } = req.body;

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Please provide start_time and end_time",
      });
    }

    const lang = language || "arabic";
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

    const seller = await SellerV2.findByPk(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

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

    const startParsed = parseDateToUTC(start_time);
    const endParsed = parseDateToUTC(end_time);

    if (!startParsed || !endParsed) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Invalid date format for start_time or end_time",
      });
    }

    if (startParsed.dayjsObj.isAfter(endParsed.dayjsObj)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "start_time must be before end_time",
      });
    }

    const updateData = {};
    const { utc: createdAt } = getCurrentTimeBaghdad();

    if (lang === "kurdish") {
      updateData.red_line = {
        text: textKu.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
      updateData.red_lineAr = null;
    } else if (lang === "arabic") {
      updateData.red_lineAr = {
        text: textAr.trim(),
        start_time: startParsed.utc,
        end_time: endParsed.utc,
        created_at: createdAt,
      };
      updateData.red_line = null;
    } else {
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
    const sellerId = req.user?.id || req.user?.seller_id;
    const seller = await SellerV2.findByPk(sellerId);

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

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
