// backend/routes/seller/loadSellerData.js
import { Router } from "express";
import sequelize from "../../database/sequelize.js";
import Product from "../../database/products.js";
import Seller from "../../database/sellerv2.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
import { ensureSellerStorageUsage } from "../../utils/sellerStorageUsage.js";
import { attachActor } from "../../middlewares/staffPermissions.js";

const router = Router();

const FREE_PLAN_ID = 1;
const TRIAL_PLAN_ID = 9;
const GRACE_PERIOD_HOURS = 24;
const DELETION_PERIOD_DAYS = 16;

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

// /load-info کراوەیە بۆ هەموو ڕۆڵەکان بەبێ جیاوازی
router.get(
  "/load-info",
  jwtVerifySellerToken,
  attachActor,
  async (req, res) => {
    try {
      const sellerId =
        res.locals.sellerId || req.user?.seller_id || req.user?.id;
      const now = new Date();

      const seller = await Seller.findByPk(sellerId, {
        attributes: [
          "id",
          "name",
          "shop_name",
          "default_shop_lang",
          "business_type",
          "created_at",
        ],
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

      let sellerPlanRecord = await SellerPlan.findOne({
        where: { seller_id: sellerId },
      });

      if (!sellerPlanRecord) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Plan not found",
        });
      }

      const planRow = await Plan.findByPk(sellerPlanRecord.plan_id);
      const planName = planRow?.name ?? "Free";

      const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;
      const isPaid = !isTrial && sellerPlanRecord.plan_id !== FREE_PLAN_ID;

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
        if (expired) {
          warningAndClosedStatus = { ...warningAndClosedStatus, ...expired };
        }
      } else if (isPaid) {
        const expired = await handleExpiredPlan(
          sellerPlanRecord,
          "plan_expired",
          now,
        );
        if (expired) {
          warningAndClosedStatus = { ...warningAndClosedStatus, ...expired };
        }
      }

      const [currentProductCount, storageUsedMb] = await Promise.all([
        Product.count({ where: { seller_id: sellerId } }),
        ensureSellerStorageUsage(sellerId, planRow, { force: false }),
      ]);

      const maxProducts = planRow?.max_products ?? 0;

      return res.status(200).json({
        success: true,
        error: false,
        productLimitReached: currentProductCount >= maxProducts,
        maxProducts,
        currentProductCount,
        sellerPlan: planName,
        planId: sellerPlanRecord.plan_id,
        planStartDate: sellerPlanRecord.start_date,
        planEndDate: sellerPlanRecord.end_date,
        sellerId: seller.id,
        sellerName: seller.name,
        shopName: seller.shop_name,
        business_type: seller.business_type || "retail",
        defaultShopLang: seller.default_shop_lang || "ku",
        sellerRegistrationDate: seller.created_at || seller.createdAt,
        storageLimitMb: planRow?.storage_limit_mb ?? 0,
        storageUsedMb: parseFloat(storageUsedMb ?? 0),
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
  },
);

export default router;
