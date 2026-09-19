import { Router } from "express";
import { Op } from "sequelize";
import sequelize from "../../database/sequelize.js";

import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import Seller from "../../database/sellerv2.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
import {
  checkAndCleanProductExpiration,
  normalizeProduct,
} from "../../utils/productV2Promos.js";
import { ensureSellerStorageUsage } from "../../utils/sellerStorageUsage.js";
import {
  processRedLineData,
  getRedLineStatus,
  toUTC,
} from "../../utils/timezoneHandler.js";
import { normalizeUiSettings } from "../../utils/uiSettings.js";
import { getCategoryMap } from "../../utils/categoryTranslations.js";
import {
  canAccessDashboard,
  requirePermission,
} from "../../middlewares/staffPermissions.js";

const router = Router();

const FREE_PLAN_ID = 1;
const TRIAL_PLAN_ID = 9;
const FREE_PLAN_END_DATE = new Date("2099-12-31");
const GRACE_PERIOD_HOURS = 24;
const DELETION_PERIOD_DAYS = 16;
const MAX_PRODUCT_LIMIT = 100;
const DEFAULT_PRODUCT_LIMIT = 30;

function safeJsonParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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
  } catch {}
  return null;
}

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

function sellerBase(seller, sellerPlanRecord, planName) {
  return {
    success: true,
    error: false,
    logout: false,
    seller_id: seller.id,
    seller_name: seller.name,
    shop_name: seller.shop_name,
    business_type: seller.business_type || "retail",
    plan_id: sellerPlanRecord?.plan_id ?? null,
    sellerPlan: planName,
    plan_end_date: sellerPlanRecord?.end_date ?? null,
  };
}

async function handleExpiredPlan(
  seller,
  sellerPlanRecord,
  planName,
  closeReason,
  now,
) {
  const endDate = new Date(sellerPlanRecord.end_date);
  const state = getExpiryState(endDate, now);
  if (!state) return null;

  const base = sellerBase(seller, sellerPlanRecord, planName);
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
      ...base,
      yourShopClose: false,
      plan_warning: true,
      warning_type: closeReason,
      hours_remaining: state.hoursRemaining,
      minutes_remaining: state.minutesRemaining,
      message: `Your ${isTrial ? "trial period" : "plan"} has expired. Renew within 24 hours or your shop will close.`,
      sellerRegistrationDate: seller.created_at || seller.createdAt,
      products: [],
      offers: [],
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
      ...base,
      yourShopClose: true,
      closeReason,
      sellerRegistrationDate: seller.created_at || seller.createdAt,
      days_until_deletion: state.daysUntilDeletion,
      message:
        "Your shop is closed. Renew your plan or your data will be deleted.",
    };
  }

  return {
    ...base,
    yourShopClose: true,
    closeReason: `${closeReason}_deleted`,
    sellerRegistrationDate: seller.created_at || seller.createdAt,
    days_until_deletion: 0,
    message: "Your plan has expired and the grace period has passed.",
  };
}

function parseRedLine(raw) {
  const result = processRedLineData(raw);
  return {
    data: result.data,
    status: result.status,
    needsCleanup: result.needsCleanup,
  };
}

// Dashboard data is shop/storefront content (products, offers, red line, sections info, plan limits).
// Every role that can open the dashboard needs it (product_manager, shop_editor, admin, owner), so the
// guard is "accessDashboard". Cashiers have no dashboard access and are rejected here.
router.get("/dashboard", canAccessDashboard, async (req, res) => {
  try {
    const id = req.actor.sellerId;
    const now = new Date();

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

    const seller = await Seller.findByPk(id);
    if (!seller) {
      res.clearCookie("s_t", clearCookieOpts());
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found in V2",
      });
    }

    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    if (!sellerPlanRecord) {
      const wantsTrial = selectedPlan?.name === "trial";
      let newPlanData;

      if (wantsTrial) {
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

    const planRow = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = planRow?.name ?? "Free";

    const isTrial = sellerPlanRecord.plan_id === TRIAL_PLAN_ID;
    const isFree = sellerPlanRecord.plan_id === FREE_PLAN_ID;
    const isPaid = !isTrial && !isFree;

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

    const [
      currentProductCount,
      currentOfferCount,
      offers,
      { count: totalProductsCount, rows: rawProducts },
      storageUsedMb,
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
        include: [
          {
            model: ProductImage,
            as: "productImages",
            attributes: ["image_key", "thumb_key", "is_main"],
            required: false,
          },
        ],
        limit: productLimit,
        offset: productOffset,
        order: [["id", "DESC"]],
        distinct: true,
      }),
      ensureSellerStorageUsage(id, planRow, { force: false }),
    ]);

    SellerOffer.destroy({
      where: { seller_id: id, end_date: { [Op.lt]: now } },
    }).catch((err) =>
      console.error("[dashboard] Failed to delete expired offers:", err),
    );

    const cleanedRows = await checkAndCleanProductExpiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProduct(row));
    const hasMoreProducts = productOffset + productLimit < totalProductsCount;

    const ku = parseRedLine(seller.red_line);
    const ar = parseRedLine(seller.red_lineAr);

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
        status: kuStatus || arStatus,
      };
    }

    let productBadges = seller.product_badges || [];
    if (typeof productBadges === "string") {
      try {
        productBadges = JSON.parse(productBadges);
      } catch {
        productBadges = [];
      }
    }

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      message: "Dashboard loaded successfully",
      ...sellerBase(seller, sellerPlanRecord, planName),
      sellerRegistrationDate: seller.created_at || seller.createdAt,
      product_badges: Array.isArray(productBadges) ? productBadges : [],
      yourShopClose: false,
      is_trial: sellerPlanRecord.is_trial,
      trial_ended: sellerPlanRecord.trial_ended,
      plan_start_date: sellerPlanRecord.start_date,
      show_plan_selection: sellerPlanRecord.plan_id === FREE_PLAN_ID,
      selected_plan_info: selectedPlan,
      brand_color: seller.brand_color ?? null,
      category_translations: getCategoryMap(seller),
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
      storage_limit_mb: planRow?.storage_limit_mb ?? 0,
      storage_used_mb: parseFloat(storageUsedMb ?? 0),
      default_shop_lang: seller.default_shop_lang || "ku",
      order_type: seller.order_type || "both",
      ui_settings: normalizeUiSettings(seller.ui_settings),
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

// Badges are a storefront-display feature (ribbon on the product card), so they use
// "manageShopSections" (shop_editor + admin + owner), NOT "manageSettings".
const canManageBadges = requirePermission("manageShopSections");

router.post("/product-badges", canManageBadges, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const { productId, titleKu, titleAr, bgColor } = req.body;

    const parsedProductId = Number(productId);
    if (!parsedProductId || !titleKu?.trim() || !titleAr?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Product ID and titles for both languages are required.",
      });
    }

    const productExists = await Product.findOne({
      where: { id: parsedProductId, seller_id: sellerId },
    });

    if (!productExists) {
      return res.status(404).json({
        success: false,
        message: "Product not found or does not belong to your shop.",
      });
    }

    const seller = await Seller.findByPk(sellerId);
    let currentBadges = seller.product_badges || [];
    if (typeof currentBadges === "string") {
      try {
        currentBadges = JSON.parse(currentBadges);
      } catch {
        currentBadges = [];
      }
    }

    const updatedBadges = currentBadges.filter(
      (b) => Number(b.productId) !== parsedProductId,
    );
    const newBadge = {
      productId: parsedProductId,
      titleKu: titleKu.trim(),
      titleAr: titleAr.trim(),
      bgColor: bgColor || "#000000",
    };
    updatedBadges.push(newBadge);

    await seller.update({ product_badges: updatedBadges });

    return res.status(200).json({
      success: true,
      message: "Badge saved successfully.",
      product_badges: updatedBadges,
    });
  } catch (error) {
    console.error("Error saving product badge:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

router.delete(
  "/product-badges/:productId",
  canManageBadges,
  async (req, res) => {
    try {
      const sellerId = req.actor.sellerId;
      const { productId } = req.params;

      const parsedProductId = Number(productId);
      if (!parsedProductId) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid product ID." });
      }

      const seller = await Seller.findByPk(sellerId);
      if (!seller) {
        return res
          .status(404)
          .json({ success: false, message: "Seller not found." });
      }

      let currentBadges = seller.product_badges || [];
      if (typeof currentBadges === "string") {
        try {
          currentBadges = JSON.parse(currentBadges);
        } catch {
          currentBadges = [];
        }
      }

      const updatedBadges = currentBadges.filter(
        (b) => Number(b.productId) !== parsedProductId,
      );

      await seller.update({ product_badges: updatedBadges });

      return res.status(200).json({
        success: true,
        message: "Badge deleted successfully.",
        product_badges: updatedBadges,
      });
    } catch (error) {
      console.error("Error deleting product badge:", error);
      return res.status(500).json({ success: false, message: "Server error." });
    }
  },
);

export default router;
