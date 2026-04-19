import { Router } from "express";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
const router = Router();

function isShopOpen(planRecord) {
  if (!planRecord) return false;
  if (planRecord.plan_id === 1) return false;
  const gracePeriodMs = 24 * 60 * 60 * 1000;
  return Date.now() <= new Date(planRecord.end_date).getTime() + gracePeriodMs;
}

router.get("/:shopName/profile", async (req, res) => {
  try {
    const { shopName } = req.params;

    // Find seller by shop_name (case-insensitive)
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
        "phone",
        "bio",
        "shop_location",
        "default_shop_lang",
        "createdAt",
      ],
    });

    if (!sellerData) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Check seller plan — close shop if free or expired
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

    // Transform data for frontend
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
