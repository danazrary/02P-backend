import { Router } from "express";
import { Op } from "sequelize";
import sequelize from "../../database/sequelize.js";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
import {
  processRedLineData,
  getRedLineStatus,
  toUTC,
} from "../../utils/timezoneHandler.js";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const FREE_PLAN_ID = 1;
const TRIAL_PLAN_ID = 9;
const FREE_PLAN_END_DATE = new Date("2099-12-31");
const GRACE_PERIOD_HOURS = 24;
const DELETION_PERIOD_DAYS = 16;
const MAX_PRODUCT_LIMIT = 100;
const DEFAULT_PRODUCT_LIMIT = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string or return the value as-is if already an object.
 * Returns null on any failure.
 */
function safeJsonParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Parse and validate the `selectedPlan` query param from the client.
 * Accepts only { name: string } to prevent prototype pollution or injection.
 */
function parseSelectedPlan(raw) {
  if (!raw) return null;
  try {
    const parsed = safeJsonParse(decodeURIComponent(raw));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.name === "string"
    ) {
      return { name: parsed.name };
    }
  } catch {
    // malformed input — ignore
  }
  return null;
}

/**
 * Compute expiry phase from an end date relative to now.
 * Returns null when the plan has NOT yet expired.
 */
function getExpiryState(endDate, now) {
  if (endDate >= now) return null;

  const hoursElapsed = (now - endDate) / (1000 * 60 * 60);
  const daysElapsed = hoursElapsed / 24;

  if (hoursElapsed < GRACE_PERIOD_HOURS) {
    const hoursRemaining = Math.floor(GRACE_PERIOD_HOURS - hoursElapsed);
    const minutesRemaining = Math.floor(
      (GRACE_PERIOD_HOURS - hoursElapsed - hoursRemaining) * 60,
    );
    return { phase: "warning", hoursRemaining, minutesRemaining };
  }

  if (daysElapsed <= DELETION_PERIOD_DAYS) {
    return {
      phase: "closed",
      daysUntilDeletion: Math.floor(DELETION_PERIOD_DAYS - daysElapsed),
    };
  }

  return { phase: "deleted" };
}

/**
 * Shared seller identity fields reused across all responses.
 */
function sellerBase(seller, sellerPlanRecord, planName) {
  return {
    success: true,
    error: false,
    logout: false,
    seller_id: seller.id,
    seller_name: seller.name,
    shop_name: seller.shop_name,
    plan_id: sellerPlanRecord?.plan_id ?? null,
    sellerPlan: planName,
    plan_end_date: sellerPlanRecord?.end_date ?? null,
  };
}

/**
 * Handle an expired plan (trial or paid).
 * Uses isolated write transactions only when a DB update is needed.
 * Returns a complete response object when the plan is expired, or null if still valid.
 */
async function handleExpiredPlan(
  seller,
  sellerPlanRecord,
  planName,
  closeReason,
  now,
) {
  const endDate = new Date(sellerPlanRecord.end_date);
  const state = getExpiryState(endDate, now);
  if (!state) return null; // plan still active

  const base = sellerBase(seller, sellerPlanRecord, planName);
  const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;

  if (state.phase === "warning") {
    // Write: mark trial as ended (trial plans only)
    if (isTrial) {
      const t = await sequelize.transaction();
      try {
        await sellerPlanRecord.update(
          { trial_ended: true },
          { transaction: t },
        );
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
    }
    return {
      ...base,
      yourShopClose: false,
      plan_warning: true,
      warning_type: closeReason,
      hours_remaining: state.hoursRemaining,
      minutes_remaining: state.minutesRemaining,
      message: `Your ${isTrial ? "trial period" : "plan"} has expired. Renew within 24 hours or your shop will close.`,
      products: [],
      offers: [],
    };
  }

  if (state.phase === "closed") {
    // Write: deactivate shop; also mark trial_ended for trial plans
    const updatePayload = { status: false };
    if (isTrial) updatePayload.trial_ended = true;

    const t = await sequelize.transaction();
    try {
      await sellerPlanRecord.update(updatePayload, { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    return {
      ...base,
      yourShopClose: true,
      closeReason,
      days_until_deletion: state.daysUntilDeletion,
      message:
        "Your shop is closed. Renew your plan or your data will be deleted.",
    };
  }

  // phase === "deleted" — no write needed; admin cleanup handles actual deletion
  return {
    ...base,
    yourShopClose: true,
    closeReason: `${closeReason}_deleted`,
    days_until_deletion: 0,
    message: "Your plan has expired and the grace period has passed.",
  };
}

/**
 * Parse a red_line / red_lineAr field from the seller record.
 * Uses Baghdad timezone for comparisons.
 * Returns { data: object|null, status: string|null, needsCleanup: boolean }.
 */
function parseRedLine(raw) {
  const result = processRedLineData(raw);
  return {
    data: result.data,
    status: result.status,
    needsCleanup: result.needsCleanup,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/dashboard", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const now = new Date();

    // ── Validate & parse query params ─────────────────────────────────────────
    const selectedPlan = parseSelectedPlan(req.query.selectedPlan);
    const productLimit = Math.min(
      Math.max(
        parseInt(req.query.productLimit, 10) || DEFAULT_PRODUCT_LIMIT,
        1,
      ),
      MAX_PRODUCT_LIMIT,
    );
    const productOffset = Math.max(
      parseInt(req.query.productOffset, 10) || 0,
      0,
    );

    // ── 1. Fetch seller (READ) ─────────────────────────────────────────────────
    const seller = await Seller.findByPk(id);
    if (!seller) {
      res.clearCookie("s_t", clearCookieOpts());
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    // ── 2. Fetch existing seller plan (READ) ───────────────────────────────────
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    // ── 3. Create plan if missing (WRITE — isolated transaction) ──────────────
    if (!sellerPlanRecord) {
      const wantsTrial = selectedPlan?.name === "trial";
      let newPlanData;

      if (wantsTrial) {
        // READ: fetch trial plan duration before opening transaction
        const trialPlan = await Plan.findByPk(TRIAL_PLAN_ID);
        const trialDays = trialPlan?.duration_days ?? 7;
        newPlanData = {
          seller_id: id,
          plan_id: TRIAL_PLAN_ID,
          start_date: toUTC(now),
          end_date: toUTC(new Date(now.getTime() + trialDays * 86_400_000)),
          is_trial: true,
          trial_ended: false,
          status: true,
        };
      } else {
        newPlanData = {
          seller_id: id,
          plan_id: FREE_PLAN_ID,
          start_date: toUTC(now),
          end_date: toUTC(FREE_PLAN_END_DATE),
          is_trial: false,
          trial_ended: false,
          status: true,
        };
      }

      const t = await sequelize.transaction();
      try {
        sellerPlanRecord = await SellerPlan.create(newPlanData, {
          transaction: t,
        });
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
    }

    // ── 4. Fetch plan details (READ) ───────────────────────────────────────────
    const planRow = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = planRow?.name ?? "Free";

    // ── 5. Plan type flags — derived exclusively from plan_id ─────────────────
    const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;
    const isFree = sellerPlanRecord.plan_id === FREE_PLAN_ID;
    const isPaid = !isTrial && !isFree;

    // ── 6. Expiry checks (writes isolated inside handleExpiredPlan) ────────────
    if (isTrial) {
      const expiredResponse = await handleExpiredPlan(
        seller,
        sellerPlanRecord,
        planName,
        "trial_expired",
        now,
      );
      if (expiredResponse) return res.status(200).json(expiredResponse);
    }

    if (isPaid) {
      const expiredResponse = await handleExpiredPlan(
        seller,
        sellerPlanRecord,
        planName,
        "plan_expired",
        now,
      );
      if (expiredResponse) return res.status(200).json(expiredResponse);
    }

    // ── 7. Parallel reads: counts, offers, products ───────────────────────────
    const [
      currentProductCount,
      currentOfferCount,
      offers,
      { count: totalProductsCount, rows: rawProducts },
    ] = await Promise.all([
      Product.count({ where: { seller_id: id } }),
      SellerOffer.count({ where: { seller_id: id, is_active: true } }),
      SellerOffer.findAll({
        where: {
          seller_id: id,
          is_active: true,
          end_date: { [Op.gte]: now },
        },
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
      }),
      Product.findAndCountAll({
        where: { seller_id: id },
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
        limit: productLimit,
        offset: productOffset,
        order: [["id", "DESC"]],
      }),
    ]);

    // ── 8. Expired offer cleanup (WRITE — fire-and-forget, non-blocking) ──────
    SellerOffer.destroy({
      where: { seller_id: id, end_date: { [Op.lt]: now } },
    }).catch((err) =>
      console.error("[dashboard] Failed to delete expired offers:", err),
    );

    // ── 9. Clean expired product discounts / free delivery ────────────────────
    const products = await checkAndCleanProductExpiration(rawProducts);
    const hasMoreProducts = productOffset + productLimit < totalProductsCount;

    // ── 10. Red line processing (Baghdad timezone) ───────────────────────────
    const ku = parseRedLine(seller.red_line);
    const ar = parseRedLine(seller.red_lineAr);

    // WRITE: clean up expired/invalid red_line fields in one call (fire-and-forget)
    if (ku.needsCleanup || ar.needsCleanup) {
      const updateObj = {};
      if (ku.needsCleanup) updateObj.red_line = null;
      if (ar.needsCleanup) updateObj.red_lineAr = null;
      Seller.update(updateObj, { where: { id } }).catch((err) =>
        console.error("[dashboard] Failed to clean red_line fields:", err),
      );
    }

    let redLine = null;
    if (ku.data || ar.data) {
      const language =
        ku.data && ar.data ? "both" : ku.data ? "kurdish" : "arabic";
      const kuStatus = ku.data
        ? getRedLineStatus(ku.data.start_time, ku.data.end_time)
        : null;
      const arStatus = ar.data
        ? getRedLineStatus(ar.data.start_time, ar.data.end_time)
        : null;

      redLine = {
        textKu: ku.data?.text ?? "",
        textAr: ar.data?.text ?? "",
        language,
        start_time: ku.data?.start_time ?? ar.data?.start_time,
        end_time: ku.data?.end_time ?? ar.data?.end_time,
        status: kuStatus || arStatus, // "coming_soon" | "active" | "expired"
      };
    }

    // ── 11. Success response ──────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      message: "Dashboard loaded successfully",
      ...sellerBase(seller, sellerPlanRecord, planName),
      yourShopClose: false,
      is_trial: sellerPlanRecord.is_trial,
      trial_ended: sellerPlanRecord.trial_ended,
      plan_start_date: sellerPlanRecord.start_date,
      show_plan_selection: sellerPlanRecord.plan_id === FREE_PLAN_ID,
      selected_plan_info: selectedPlan,
      brand_color: seller.brand_color ?? null,
      categories: seller.categories || [],
      red_line: redLine,
      products,
      totalProducts: totalProductsCount,
      hasMoreProducts,
      offers,
      product_limit_reached:
        currentProductCount >= (planRow?.max_products ?? 0),
      offer_limit_reached: currentOfferCount >= (planRow?.max_offers ?? 0),
      max_products: planRow?.max_products ?? 0,
      max_offers: planRow?.max_offers ?? 0,
      current_product_count: currentProductCount,
      current_offer_count: currentOfferCount,
      default_shop_lang: seller.default_shop_lang || "ku",
    });
  } catch (error) {
    console.error("[dashboard] Unhandled error:", error);
    return res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

// Activate trial plan for seller
router.post("/activate-trial", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;

    // Find seller's current plan
    const sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    if (!sellerPlanRecord) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "No plan record found",
      });
    }

    // Check if trial was already used
    if (sellerPlanRecord.trial_ended) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Trial has already been used",
      });
    }

    // Check if already on trial
    if (sellerPlanRecord.plan_id === 9) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Already on trial plan",
      });
    }

    // Activate trial plan (7 days)
    const trialDays = 7;
    const trialStartDate = toUTC(new Date());
    const trialEndDate = toUTC(
      new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
    );

    await sellerPlanRecord.update({
      plan_id: 9, // Trial plan ID
      start_date: trialStartDate,
      end_date: trialEndDate,
      is_trial: true,
      status: true,
    });

    console.log(`\u2705 Activated trial plan for seller ${id}`);

    return res.status(200).json({
      success: true,
      error: false,
      message: "Trial activated successfully",
      plan_id: 9,
      trial_days: trialDays,
      end_date: trialEndDate,
    });
  } catch (error) {
    console.error("Error activating trial:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
