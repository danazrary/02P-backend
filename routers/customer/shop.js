import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import ShopSection from "../../database/ShopSection.js";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
import {
  processRedLineData,
  getRedLineStatus,
  toUTC,
} from "../../utils/timezoneHandler.js";
import { Op } from "sequelize";

const router = Router();

const SECTION_KEYS = ["hero", "flash_banner", "brands", "discount"];

const DEFAULT_CONFIGS = {
  hero: {
    items: [],
  },
  flash_banner: {
    height: "72px",
    width: "100%",
    fontSize: "22px",
    viewMode: "home",
  },
  brands: {
    titleKu: "براندەکان",
    titleAr: "العلامات التجارية",
    titleEn: "Brands",
    layout: "slider",
    items: [],
  },
  discount: {},
};

function normalizeBrandItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item?.isActive !== false && item?.logo)
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : String(index),
      name: typeof item.name === "string" ? item.name : "",
      logo: typeof item.logo === "string" ? item.logo : "",
      link: typeof item.link === "string" ? item.link : "",
      isActive: true,
      sortOrder: Number.isFinite(Number(item.sortOrder))
        ? Number(item.sortOrder)
        : index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function buildUiSettingsFromSections(shopSections) {
  const sectionMap = {};

  shopSections.forEach((section) => {
    sectionMap[section.section_key] = section;
  });

  return {
    heroSection: {
      enabled: sectionMap.hero?.is_visible ?? true,
      ...(sectionMap.hero?.config || DEFAULT_CONFIGS.hero),
    },
    flashDiscountBanner: {
      enabled: sectionMap.flash_banner?.is_visible ?? true,
      ...(sectionMap.flash_banner?.config || DEFAULT_CONFIGS.flash_banner),
    },
    discountsSection: {
      enabled: sectionMap.discount?.is_visible ?? true,
      ...(sectionMap.discount?.config || DEFAULT_CONFIGS.discount),
    },
  };
}

async function getShopSections(sellerId) {
  const sectionRows = await ShopSection.findAll({
    where: {
      seller_id: sellerId,
      section_key: {
        [Op.in]: SECTION_KEYS,
      },
    },
    attributes: ["section_key", "is_visible", "config"],
  });

  const sectionMap = {};

  sectionRows.forEach((row) => {
    sectionMap[row.section_key] = row;
  });

  return SECTION_KEYS.map((key) => {
    const row = sectionMap[key];
    const defaultConfig = DEFAULT_CONFIGS[key];

    if (!row) {
      if (key === "brands") return null;
      return {
        section_key: key,
        is_visible: true,
        config: defaultConfig,
      };
    }

    if (key === "brands") {
      const activeItems = normalizeBrandItems(row.config?.items);
      if (row.is_visible !== true || activeItems.length === 0) return null;

      return {
        section_key: key,
        is_visible: true,
        config: {
          ...defaultConfig,
          ...(row.config || {}),
          items: activeItems,
        },
      };
    }

    return {
      section_key: key,
      is_visible: row.is_visible,
      config: {
        ...defaultConfig,
        ...(row.config || {}),
      },
    };
  }).filter(Boolean);
}

router.get("/:shopName", detectSeller, async (req, res) => {
  try {
    const { shopName } = req.params;

    const seller = await Seller.findOne({
      where: { shop_name: shopName },
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    const sellerId = seller.id;

    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: sellerId,
        plan_id: 1,
        start_date: toUTC(new Date()),
        end_date: toUTC(new Date("2099-12-31")),
        is_trial: false,
        trial_ended: false,
        status: true,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.plan_id);

    const offers = await SellerOffer.findAll({
      where: { seller_id: sellerId, is_active: true },
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

    let products = await Product.findAll({
      where: { seller_id: sellerId },
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
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "colors",
        "sizes",
        "stock",
        "isAvailable",
        "category",
        "subcategory",
      ],
    });

    products = await checkAndCleanProductExpiration(products);

    const shopSections = await getShopSections(sellerId);
    const uiSettings = buildUiSettingsFromSections(shopSections);

    let redLine = null;
    const kuResult = processRedLineData(seller.red_line);
    const arResult = processRedLineData(seller.red_lineAr);

    if (kuResult.data || arResult.data) {
      let language = "both";

      if (kuResult.data && !arResult.data) language = "kurdish";
      else if (!kuResult.data && arResult.data) language = "arabic";

      const kuStatus = kuResult.data
        ? getRedLineStatus(kuResult.data.start_time, kuResult.data.end_time)
        : null;

      const arStatus = arResult.data
        ? getRedLineStatus(arResult.data.start_time, arResult.data.end_time)
        : null;

      redLine = {
        textKu: kuResult.data?.text || "",
        textAr: arResult.data?.text || "",
        language,
        start_time: kuResult.data?.start_time || arResult.data?.start_time,
        end_time: kuResult.data?.end_time || arResult.data?.end_time,
        status: kuStatus || arStatus,
      };
    }

    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      red_line: redLine,
      brand_color: seller.brand_color || null,
      offers,
      products,

      // New correct data from shop_sections table
      sections: shopSections,

      // Old frontend-compatible shape, also from shop_sections table
      ui_settings: uiSettings,
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

// Search products in a shop
router.get("/:shopName/search", async (req, res) => {
  try {
    const { shopName } = req.params;
    const { q, filter = "title" } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
        message: "No search query provided",
      });
    }

    const seller = await Seller.findOne({ where: { shop_name: shopName } });
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    const searchTerm = q.trim();

    // Build search conditions based on filter
    let searchConditions;
    if (filter === "description") {
      // Search only in descriptions
      searchConditions = [
        { descriptionKu: { [Op.like]: `%${searchTerm}%` } },
        { descriptionAr: { [Op.like]: `%${searchTerm}%` } },
      ];
    } else {
      // Search in titles (default) - also includes descriptions for more results
      searchConditions = [
        { titleKu: { [Op.like]: `%${searchTerm}%` } },
        { titleAr: { [Op.like]: `%${searchTerm}%` } },
        { descriptionKu: { [Op.like]: `%${searchTerm}%` } },
        { descriptionAr: { [Op.like]: `%${searchTerm}%` } },
      ];
    }

    let products = await Product.findAll({
      where: {
        seller_id: seller.id,
        [Op.or]: searchConditions,
      },
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
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "colors",
        "sizes",
        "stock",
        "isAvailable",
        "category",
        "subcategory",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "is_main"],
        },
      ],
      limit: 50,
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    res.status(200).json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/customer/track-visit
   Called by the frontend once per page-load session to record
   a shop visitor. Deduplication is handled by the frontend
   using a module-level in-memory Set (resets on page refresh).
───────────────────────────────────────────────────────────── */
router.post("/track-visit", detectSeller, async (req, res) => {
  try {
    // Skip if the requester is the seller viewing their own shop
    if (req.isSeller) {
      return res.status(200).json({ success: true, skipped: true });
    }

    const { seller_id } = req.body;
    if (!seller_id || !Number.isInteger(Number(seller_id))) {
      return res
        .status(400)
        .json({ success: false, message: "seller_id is required" });
    }

    const today = new Date().toISOString().split("T")[0];

    const [report, created] = await Report.findOrCreate({
      where: {
        seller_id: Number(seller_id),
        report_date: today,
      },
      defaults: { shopVisitors: 1 },
    });

    if (!created) {
      await report.increment("shopVisitors", { by: 1 });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("track-visit error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
