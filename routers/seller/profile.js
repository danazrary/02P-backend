import { Router } from "express";
import Seller from "../../database/seller.js";
const router = Router();

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
