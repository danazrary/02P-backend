import { Router } from "express";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import Seller from "../../database/sellerv2.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import ShopSection from "../../database/ShopSection.js";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";
import {
  checkAndCleanProductExpiration,
  normalizeProduct,
} from "../../utils/productV2Promos.js";
import {
  processRedLineData,
  getRedLineStatus,
  getCurrentTimeBaghdad,
} from "../../utils/timezoneHandler.js";
import { normalizeUiSettings } from "../../utils/uiSettings.js";
import { getCategoryMap } from "../../utils/categoryTranslations.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);
const router = Router();

const SECTION_KEYS = [
  "hero",
  "flash_banner",
  "brands",
  "discount",
  "featured_categories",
];

const DEFAULT_SECTION_CONFIGS = {
  hero: { items: [] },
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
  featured_categories: { category_keys: [] },
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

function normalizeFeaturedCategoryKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((k) => typeof k === "string" && k.trim().length > 0)
    .slice(0, 6);
}

function buildUiSettingsFromSections(shopSections) {
  const sectionMap = {};
  shopSections.forEach((section) => {
    sectionMap[section.section_key] = section;
  });

  return {
    heroSection: {
      enabled: sectionMap.hero?.is_visible ?? true,
      ...(sectionMap.hero?.config || DEFAULT_SECTION_CONFIGS.hero),
    },
    flashDiscountBanner: {
      enabled: sectionMap.flash_banner?.is_visible ?? true,
      ...(sectionMap.flash_banner?.config ||
        DEFAULT_SECTION_CONFIGS.flash_banner),
    },
    discountsSection: {
      enabled: sectionMap.discount?.is_visible ?? true,
      ...(sectionMap.discount?.config || DEFAULT_SECTION_CONFIGS.discount),
    },
  };
}

async function getShopSections(sellerId) {
  const sectionRows = await ShopSection.findAll({
    where: {
      seller_id: sellerId,
      section_key: { [Op.in]: SECTION_KEYS },
    },
    attributes: ["section_key", "is_visible", "config"],
  });

  const sectionMap = {};
  sectionRows.forEach((row) => {
    sectionMap[row.section_key] = row;
  });

  return SECTION_KEYS.map((key) => {
    const row = sectionMap[key];
    const defaultConfig = DEFAULT_SECTION_CONFIGS[key];

    if (!row) {
      if (key === "brands") return null;
      return { section_key: key, is_visible: true, config: defaultConfig };
    }

    if (key === "brands") {
      const activeItems = normalizeBrandItems(row.config?.items);
      if (row.is_visible !== true || activeItems.length === 0) return null;
      return {
        section_key: key,
        is_visible: true,
        config: { ...defaultConfig, ...(row.config || {}), items: activeItems },
      };
    }

    if (key === "featured_categories") {
      return {
        section_key: key,
        is_visible: row.is_visible,
        config: {
          ...defaultConfig,
          ...(row.config || {}),
          category_keys: normalizeFeaturedCategoryKeys(
            row.config?.category_keys,
          ),
        },
      };
    }

    return {
      section_key: key,
      is_visible: row.is_visible,
      config: { ...defaultConfig, ...(row.config || {}) },
    };
  }).filter(Boolean);
}

// 1) Category Endpoint
router.get(
  "/sellers-customer/:shopName/category",
  detectSeller,
  async (req, res) => {
    const { shopName } = req.params;
    try {
      let role = false;
      let sellerShop = null;

      if (req.isSeller && req.seller) {
        const findSeller = await Seller.findByPk(req.seller.id, {
          attributes: ["shop_name"],
        });
        role = true;
        sellerShop = findSeller ? findSeller.shop_name : null;
      }

      const seller = await Seller.findOne({
        where: { shop_name: shopName.trim().toLowerCase() },
        attributes: [
          "id",
          "name",
          "shop_name",
          "shop_image",
          "bio",
          "shop_location",
          "brand_color",
          "business_type",
          "default_shop_lang",
          "order_type",
          "category_translations",
          "ui_settings",
          "is_active",
        ],
      });

      if (!seller || seller.is_active === false) {
        return res.status(200).json({
          success: false,
          error: true,
          isSeller: role,
          message: "Seller shop not found",
        });
      }

      const sellerPlanRecord = await SellerPlan.findOne({
        where: { seller_id: seller.id },
      });
      if (!sellerPlanRecord) {
        return res.status(200).json({
          success: true,
          error: false,
          isSeller: role,
          shopName: sellerShop,
          yourShopClose: true,
          closeReason: "no_plan",
          seller: {
            id: seller.id,
            name: seller.name,
            shop_name: seller.shop_name,
            shop_image: seller.shop_image,
          },
        });
      }

      return res.status(200).json({
        success: true,
        error: false,
        isSeller: role,
        shopName: sellerShop,
        yourShopClose: false,
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
          bio: seller.bio || null,
          shop_location: seller.shop_location || null,
          brand_color: seller.brand_color || null,
          business_type: seller.business_type || "retail",
        },
        default_shop_lang: seller.default_shop_lang || "ku",
        order_type: seller.order_type || "both",
        category_translations: getCategoryMap(seller),
        ui_settings: normalizeUiSettings(seller.ui_settings),
      });
    } catch (error) {
      console.error("[SHOP CATEGORY] ERROR:", error.message);
      return res
        .status(500)
        .json({ success: false, error: true, message: "Server error" });
    }
  },
);

// 2) Full Shop Home Endpoint
router.get("/sellers-customer/:shopName", detectSeller, async (req, res) => {
  let role = false;
  let sellerShop = null;
  try {
    const { shopName } = req.params;

    if (req.isSeller && req.seller) {
      const findSeller = await Seller.findByPk(req.seller.id, {
        attributes: ["shop_name"],
      });
      role = true;
      sellerShop = findSeller ? findSeller.shop_name : null;
    }

    const seller = await Seller.findOne({
      where: { shop_name: shopName.trim().toLowerCase() },
    });

    if (!seller || seller.is_active === false) {
      return res.status(200).json({
        success: false,
        error: true,
        isSeller: role,
        shopName: "null",
        message: "Seller shop not found",
      });
    }

    const sellerId = seller.id;
    const sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });
    const plan = sellerPlanRecord
      ? await Plan.findByPk(sellerPlanRecord.plan_id)
      : null;

    const allOffers = await SellerOffer.findAll({
      where: {
        seller_id: sellerId,
        is_active: true,
        type_offer: { [Op.ne]: "discount_delivery" },
      },
    });

    const { baghdadFull: currentBaghdad } = getCurrentTimeBaghdad();
    const offers = [];
    for (const offer of allOffers) {
      const startDateBaghdad = dayjs(offer.start_date).tz("Asia/Baghdad");
      const endDateBaghdad = dayjs(offer.end_date).tz("Asia/Baghdad");

      if (currentBaghdad.isAfter(endDateBaghdad)) {
        await SellerOffer.destroy({ where: { id: offer.id } });
      } else if (
        (currentBaghdad.isSame(startDateBaghdad) ||
          currentBaghdad.isAfter(startDateBaghdad)) &&
        (currentBaghdad.isSame(endDateBaghdad) ||
          currentBaghdad.isBefore(endDateBaghdad))
      ) {
        offers.push(offer);
      }
    }

    const productLimit = Math.min(parseInt(req.query.productLimit) || 30, 100);
    const productOffset = parseInt(req.query.productOffset) || 0;

    const { count: totalProducts, rows: rawProducts } =
      await Product.findAndCountAll({
        where: { seller_id: sellerId, isAvailable: true },
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
      });

    const cleanedRows = await checkAndCleanProductExpiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProduct(row));
    const hasMoreProducts = productOffset + productLimit < totalProducts;

    let redLineKu = null;
    let redLineAr = null;
    let needsCleanup = { ku: false, ar: false };

    if (seller.red_line) {
      const kuResult = processRedLineData(seller.red_line);
      redLineKu = kuResult.data;
      needsCleanup.ku = kuResult.needsCleanup;
    }
    if (seller.red_lineAr) {
      const arResult = processRedLineData(seller.red_lineAr);
      redLineAr = arResult.data;
      needsCleanup.ar = arResult.needsCleanup;
    }

    if (needsCleanup.ku || needsCleanup.ar) {
      const updateObj = {};
      if (needsCleanup.ku) updateObj.red_line = null;
      if (needsCleanup.ar) updateObj.red_lineAr = null;
      await Seller.update(updateObj, { where: { id: sellerId } });
    }

    let redLine = null;
    if (redLineKu || redLineAr) {
      const language =
        redLineKu && redLineAr ? "both" : redLineKu ? "kurdish" : "arabic";
      const kuStatus = redLineKu
        ? getRedLineStatus(redLineKu.start_time, redLineKu.end_time)
        : null;
      const arStatus = redLineAr
        ? getRedLineStatus(redLineAr.start_time, redLineAr.end_time)
        : null;

      redLine = {
        textKu: redLineKu?.text || "",
        textAr: redLineAr?.text || "",
        language,
        start_time: redLineKu?.start_time || redLineAr?.start_time,
        end_time: redLineKu?.end_time || redLineAr?.end_time,
        status: kuStatus || arStatus,
      };
    }

    const sections = await getShopSections(sellerId);
    const uiSettingsFromSections = buildUiSettingsFromSections(sections);

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
      isSeller: role,
      shopName: sellerShop || null,
      yourShopClose: false,
      seller: {
        id: seller.id,
        name: seller.name,
        shop_name: seller.shop_name,
        shop_image: seller.shop_image,
        bio: seller.bio || null,
        shop_location: seller.shop_location || null,
        business_type: seller.business_type || "retail",
      },
      default_shop_lang: seller.default_shop_lang || "ku",
      order_type: seller.order_type || "both",
      sellerPlan: plan ? plan.name : "Free",
      brand_color: seller.brand_color || null,
      category_translations: getCategoryMap(seller),
      products,
      totalProducts,
      hasMoreProducts,
      offers,
      red_line: redLine,
      sections,
      product_badges: Array.isArray(productBadges) ? productBadges : [],
      ui_settings: uiSettingsFromSections,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      isSeller: role,
      shopName: sellerShop || null,
      message: "Server error",
    });
  }
});

// 3) Pagination Endpoint
router.get("/more-products/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
      where: { seller_id: sellerId, isAvailable: true },
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
      distinct: true,
    });

    const cleanedRows = await checkAndCleanProductExpiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProduct(row));

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Error loading more products:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 4) Category Products Endpoint
router.get("/products-by-category/:sellerId", async (req, res) => {
  try {
    const { sellerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { category, subcategory } = req.query;

    const whereClause = { seller_id: sellerId, isAvailable: true };
    if (category) whereClause.category = category;
    if (subcategory) whereClause.subcategory = subcategory;

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
      distinct: true,
    });

    const cleanedRows = await checkAndCleanProductExpiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProduct(row));

    return res.status(200).json({
      success: true,
      products,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Error loading products by category:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 5) Product for Cart
router.get("/product-for-cart/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const id = parseInt(productId, 10);
    if (!id || isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findOne({
      where: { id, isAvailable: true },
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
    });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res
      .status(200)
      .json({ success: true, product: normalizeProduct(product) });
  } catch (error) {
    console.error("Error fetching product for cart:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 6) Shop Discounts
router.get("/shop-discounts/:shopName", async (req, res) => {
  try {
    const { shopName } = req.params;
    const type = req.query.type || "all";
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const seller = await Seller.findOne({
      where: { shop_name: shopName.trim().toLowerCase() },
      attributes: ["id"],
    });

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Shop not found" });
    }

    const rawProducts = await Product.findAll({
      where: {
        seller_id: seller.id,
        isAvailable: true,
        [Op.or]: [{ hasDiscount: true }, { free_delivery: true }],
      },
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
      order: [["id", "DESC"]],
    });

    const cleanedRows = await checkAndCleanProductExpiration(rawProducts);
    const products = cleanedRows.map((row) => normalizeProduct(row));

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const isExpiringSoon = (p) => {
      const discountExpiring =
        p.hasDiscount &&
        p.discountType === "timer" &&
        p.discountEndDate &&
        new Date(p.discountEndDate) >= now &&
        new Date(p.discountEndDate) <= in24Hours;
      const deliveryExpiring =
        p.free_delivery &&
        p.freeDeliveryEndDate &&
        new Date(p.freeDeliveryEndDate) >= now &&
        new Date(p.freeDeliveryEndDate) <= in24Hours;
      return discountExpiring || deliveryExpiring;
    };

    const expiringSoon = [];
    const both = [];
    const discountOnly = [];
    const freeDeliveryOnly = [];

    for (const p of products) {
      if (isExpiringSoon(p)) {
        expiringSoon.push(p);
      } else if (p.hasDiscount && p.free_delivery) {
        both.push(p);
      } else if (p.hasDiscount) {
        discountOnly.push(p);
      } else if (p.free_delivery) {
        freeDeliveryOnly.push(p);
      }
    }

    if (type === "all") {
      return res.status(200).json({
        success: true,
        expiringSoon: expiringSoon.slice(0, limit),
        expiringSoonTotal: expiringSoon.length,
        both: both.slice(0, limit),
        bothTotal: both.length,
        discountOnly: discountOnly.slice(0, limit),
        discountOnlyTotal: discountOnly.length,
        freeDeliveryOnly: freeDeliveryOnly.slice(0, limit),
        freeDeliveryOnlyTotal: freeDeliveryOnly.length,
      });
    }

    const listMap = {
      expiring_soon: expiringSoon,
      both,
      discount_only: discountOnly,
      free_delivery_only: freeDeliveryOnly,
    };
    const list = listMap[type] || [];
    const paginated = list.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      products: paginated,
      total: list.length,
      hasMore: offset + limit < list.length,
    });
  } catch (err) {
    console.error("[shop-discounts]", err);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

export default router;
