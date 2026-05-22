import { Router } from "express";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import ShopSection from "../../database/ShopSection.js";
import {
  processRedLineData,
  getRedLineStatus,
} from "../../utils/timezoneHandler.js";
const router = Router();

const DEFAULT_CONFIGS = {
  flash_banner: {
    height: "72px",
    width: "100%",
    fontSize: "22px",
    viewMode: "home",
  },
};

function isShopOpen(planRecord) {
  if (!planRecord) return false;
  if (planRecord.plan_id === 1) return false;

  const gracePeriodMs = 24 * 60 * 60 * 1000;
  return Date.now() <= new Date(planRecord.end_date).getTime() + gracePeriodMs;
}

router.get("/:shopName/profile", async (req, res) => {
  try {
    const { shopName } = req.params;

    const sellerData = await Seller.findOne({
      where: {
        shop_name: shopName,
      },
      attributes: [
        "id",
        "name",
        "shop_name",
        "shop_image",
        "brand_color",
        "social_links",
        "red_line",
        "red_lineAr",
        "phone",
        "bio",
        "shop_location",
        "default_shop_lang",
        "ui_settings",
        "createdAt",
      ],
    });

    if (!sellerData) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const flashRow = await ShopSection.findOne({
      where: {
        seller_id: sellerData.id,
        section_key: "flash_banner",
      },
      attributes: ["section_key", "is_visible", "config"],
    });

    const flashBanner = {
      section_key: "flash_banner",
      is_visible: flashRow ? flashRow.is_visible : true,
      config: {
        ...DEFAULT_CONFIGS.flash_banner,
        ...(flashRow?.config || {}),
      },
    };

    const planRecord = await SellerPlan.findOne({
      where: { seller_id: sellerData.id },
      attributes: ["plan_id", "end_date"],
    });

    if (!isShopOpen(planRecord)) {
      return res.status(200).json({
        success: true,
        yourShopClose: true,
        seller: {
          id: sellerData.id,
          name: sellerData.name,
          shop_name: sellerData.shop_name,
          shop_image: sellerData.shop_image,
          brand_color: sellerData.brand_color,
        },
      });
    }
    let redLine = null;
    const kuResult = processRedLineData(sellerData.red_line);
    const arResult = processRedLineData(sellerData.red_lineAr);

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
        status: kuStatus || arStatus, // "coming_soon" | "active" | "expired"
      };
    }
    const profileData = {
      id: sellerData.id,
      name: sellerData.name,
      shopName: sellerData.shop_name,
      shopImage: sellerData.shop_image,
      brandColor: sellerData.brand_color || null,
      whatsapp: sellerData.phone || null,
      viber: sellerData.social_links?.viber || null,
      socialMedia: {
        facebook: sellerData.social_links?.facebook || null,
        instagram: sellerData.social_links?.instagram || null,
        tiktok: sellerData.social_links?.tiktok || null,
        snapchat: sellerData.social_links?.snapchat || null,
        youtube: sellerData.social_links?.youtube || null,
        x: sellerData.social_links?.x || null,
        threads: sellerData.social_links?.threads || null,
        telegram: sellerData.social_links?.telegram || null,
      },
      bio: sellerData.bio || null,
      shopLocation: sellerData.shop_location || null,
      defaultShopLang: sellerData.default_shop_lang || "ku",
      redLine,

      flashBanner,
      joinedDate: sellerData.createdAt,
    };

    return res.status(200).json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error("Error fetching seller profile:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching seller profile",
      error: error.message,
    });
  }
});

export default router;
