import { Router } from "express";
import sequelize from "../../database/sequelize.js";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
import { ensureSellerStorageUsage } from "../../utils/sellerStorageUsage.js";

const router = Router();

// Constants
const FREE_PLAN_ID = 1;
const TRIAL_PLAN_ID = 9;
const GRACE_PERIOD_HOURS = 24;
const DELETION_PERIOD_DAYS = 16;

/**
 * Compute expiry phase from an end date relative to now.
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
 * Handle expired plans (trial or paid)
 */
async function handleExpiredPlan(sellerPlanRecord, closeReason, now) {
  const endDate = new Date(sellerPlanRecord.end_date);
  const state = getExpiryState(endDate, now);
  if (!state) return null;

  const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;

  if (state.phase === "warning") {
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
      showPlanWarning: true,
      warningType: closeReason,
      hoursRemaining: state.hoursRemaining,
      minutesRemaining: state.minutesRemaining,
      showShopClosed: false,
    };
  }

  if (state.phase === "closed") {
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
      showPlanWarning: false,
      showShopClosed: true,
      closeReason,
    };
  }

  return {
    showPlanWarning: false,
    showShopClosed: true,
    closeReason: `${closeReason}_deleted`,
  };
}

// Route: GET /api/seller/load-info
router.get("/load-info", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const now = new Date();

    // 1. Fetch Seller Basic Info
    const seller = await Seller.findByPk(id, {
      attributes: ["id", "name", "shop_name", "default_shop_lang", "createdAt"],
    });

    if (!seller) {
      res.clearCookie("s_t", clearCookieOpts());
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    // 2. Fetch Seller Plan Record
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    if (!sellerPlanRecord) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Plan not found",
      });
    }

    // 3. Fetch Plan Definition Details
    const planRow = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = planRow?.name ?? "Free";

    const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;
    const isPaid = !isTrial && sellerPlanRecord.plan_id !== FREE_PLAN_ID;

    // 4. Handle Plan Expiration Status
    let warningAndClosedStatus = {
      showPlanWarning: false,
      warningType: "",
      hoursRemaining: 0,
      minutesRemaining: 0,
      showShopClosed: false,
      closeReason: "",
    };

    if (isTrial) {
      const expired = await handleExpiredPlan(
        sellerPlanRecord,
        "trial_expired",
        now,
      );
      if (expired)
        warningAndClosedStatus = { ...warningAndClosedStatus, ...expired };
    } else if (isPaid) {
      const expired = await handleExpiredPlan(
        sellerPlanRecord,
        "plan_expired",
        now,
      );
      if (expired)
        warningAndClosedStatus = { ...warningAndClosedStatus, ...expired };
    }

    // 5. Parallel Reads: Product Count & Storage Usage ONLY
    const [currentProductCount, storageUsedMb] = await Promise.all([
      Product.count({ where: { seller_id: id } }),
      ensureSellerStorageUsage(id, planRow, { force: false }),
    ]);

    const maxProducts = planRow?.max_products ?? 0;

    // 6. Return Clean Essential Response
    return res.status(200).json({
      success: true,
      error: false,

      // Limits & Counts
      productLimitReached: currentProductCount >= maxProducts,
      maxProducts,
      currentProductCount,

      // Plan Details
      sellerPlan: planName,
      planId: sellerPlanRecord.plan_id,
      planStartDate: sellerPlanRecord.start_date,
      planEndDate: sellerPlanRecord.end_date,

      // Identity Details
      sellerId: seller.id,
      sellerName: seller.name,
      shopName: seller.shop_name,
      defaultShopLang: seller.default_shop_lang || "ku",
      sellerRegistrationDate: seller.createdAt,

      // Storage
      storageLimitMb: planRow?.storage_limit_mb ?? 0,
      storageUsedMb: parseFloat(storageUsedMb ?? 0),

      // Status Warnings
      ...warningAndClosedStatus,
    });
  } catch (error) {
    console.error("[loadSellerData] Error:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
