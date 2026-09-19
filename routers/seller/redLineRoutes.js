// backend/routes/seller/redLineRoutes.js
//
// Red line (هێڵی سوور) — the flash banner text shown on the shop.
//   POST   /add-redline     save / replace the red line
//   DELETE /delete-redline  remove the red line
//
// Guard: manageRedLine (shop_editor, admin, owner). Every query is scoped with
// req.actor.sellerId — staff have no shop id of their own.
//
// Storage matches what dashboard.js and sellers-customer read:
//   seller.red_line    -> Kurdish text   { text, start_time, end_time }
//   seller.red_lineAr  -> Arabic text    { text, start_time, end_time }
import { Router } from "express";
import Seller from "../../database/sellerv2.js";
import {
  processRedLineData,
  getRedLineStatus,
} from "../../utils/timezoneHandler.js";
import { canManageRedLine } from "../../middlewares/staffPermissions.js";

const router = Router();

const LANGUAGES = ["kurdish", "arabic", "both"];

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function buildStored(text, start_time, end_time) {
  return JSON.stringify({ text, start_time, end_time });
}

// Same response shape dashboard.js returns in `red_line`, so the page can use
// `result.data` directly after saving.
function buildRedLineResponse(kuRaw, arRaw) {
  const ku = kuRaw ? processRedLineData(kuRaw) : { data: null };
  const ar = arRaw ? processRedLineData(arRaw) : { data: null };
  if (!ku.data && !ar.data) return null;

  const language = ku.data && ar.data ? "both" : ku.data ? "kurdish" : "arabic";
  const kuStatus = ku.data
    ? getRedLineStatus(ku.data.start_time, ku.data.end_time)
    : null;
  const arStatus = ar.data
    ? getRedLineStatus(ar.data.start_time, ar.data.end_time)
    : null;

  return {
    textKu: ku.data?.text ?? "",
    textAr: ar.data?.text ?? "",
    language,
    start_time: ku.data?.start_time ?? ar.data?.start_time,
    end_time: ku.data?.end_time ?? ar.data?.end_time,
    status: kuStatus || arStatus,
  };
}

// POST /add-redline
router.post("/add-redline", canManageRedLine, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const { textKu, textAr, start_time, end_time, language } = req.body || {};

    if (!LANGUAGES.includes(language)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Invalid language",
      });
    }

    const needsKu = language === "kurdish" || language === "both";
    const needsAr = language === "arabic" || language === "both";
    const ku = cleanText(textKu);
    const ar = cleanText(textAr);

    if ((needsKu && !ku) || (needsAr && !ar)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Red line text is required",
      });
    }

    if (!isValidDate(start_time) || !isValidDate(end_time)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Start time and end time are required",
      });
    }

    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "End time must be after start time",
      });
    }

    const seller = await Seller.findByPk(sellerId, {
      attributes: ["id", "red_line", "red_lineAr"],
    });
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    const kuRaw = needsKu ? buildStored(ku, start_time, end_time) : null;
    const arRaw = needsAr ? buildStored(ar, start_time, end_time) : null;

    const data = buildRedLineResponse(kuRaw, arRaw);

    // Safety net: if the stored format is not accepted by timezoneHandler for a
    // red line that has not expired yet, fail loudly instead of saving something
    // the dashboard would silently wipe.
    if (!data && new Date(end_time) > new Date()) {
      console.error(
        "[redLine] processRedLineData rejected the value it should accept",
        { kuRaw, arRaw },
      );
      return res.status(500).json({
        success: false,
        error: true,
        message: "Red line format was rejected",
      });
    }

    await seller.update({ red_line: kuRaw, red_lineAr: arRaw });

    return res.status(200).json({
      success: true,
      error: false,
      message: "Red line saved successfully",
      data,
    });
  } catch (error) {
    console.error("Error saving red line:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

// DELETE /delete-redline
router.delete("/delete-redline", canManageRedLine, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;

    const seller = await Seller.findByPk(sellerId, {
      attributes: ["id", "red_line", "red_lineAr"],
    });
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    await seller.update({ red_line: null, red_lineAr: null });

    return res.status(200).json({
      success: true,
      error: false,
      message: "Red line deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting red line:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

export default router;
