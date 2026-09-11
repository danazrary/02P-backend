// backend/routes/seller/setting.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import SellerV2 from "../../database/sellerv2.js";
import { sellerToken } from "../../utils/addingToken.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { deleteFile } from "../../utils/deleteFile.js";
import { isReservedShopName } from "../../utils/reservedShopNames.js";
import { toUTC } from "../../utils/timezoneHandler.js";
import {
  decrementSellerStorage,
  incrementSellerStorage,
} from "../../middlewares/checkStorageLimit.js";
import { getStoredAssetBytes } from "../../utils/sellerStorageUsage.js";
import { createR2Multer, uploadToR2, deleteFromR2 } from "../../utils/r2.js";
import { normalizeUiSettings } from "../../utils/uiSettings.js";
import { getCategoryMap } from "../../utils/categoryTranslations.js";
import { notifyGoogle } from "../../utils/googleIndexing.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "dwkanlink.com";
const router = Router();

const sellerImageUpload = createR2Multer({
  fileSize: 2 * 1024 * 1024,
  files: 1,
});

const sellerSettingsUpload = createR2Multer({
  fileSize: 12 * 1024 * 1024,
  files: 2,
});

function isLegacyUploadPath(value) {
  return value?.startsWith("/uploads/") || value?.startsWith("uploads/");
}

async function deleteStoredSellerImage(imageKeyOrPath) {
  if (!imageKeyOrPath) return;

  if (isLegacyUploadPath(imageKeyOrPath)) {
    deleteFile(imageKeyOrPath);
    return;
  }

  await deleteFromR2(imageKeyOrPath);
}

async function uploadSellerImageToR2(file, sellerId) {
  const key = `shops/${sellerId}/sellers/main/${uuidv4()}.webp`;
  const { sizeBytes } = await uploadToR2(file.buffer, key, {
    width: 1280,
    height: 1280,
    qualities: [82, 76, 70, 64],
    maxOutputBytes: 500 * 1024,
  });

  return { key, sizeBytes };
}

async function uploadSellerHeroImageToR2(file, sellerId) {
  const key = `shops/${sellerId}/hero/${uuidv4()}.webp`;
  const { sizeBytes } = await uploadToR2(file.buffer, key, {
    width: 1920,
    height: 840,
    qualities: [84, 78, 72, 66],
    maxOutputBytes: 1200 * 1024,
  });

  return { key, sizeBytes };
}

function parseUiSettingsPayload(payload, fallbackSettings) {
  if (payload === undefined || payload === null || payload === "") {
    return normalizeUiSettings(fallbackSettings);
  }

  try {
    const parsed =
      typeof payload === "string" ? JSON.parse(payload) : payload || {};
    return normalizeUiSettings(parsed);
  } catch {
    return null;
  }
}

// 1) COMPLETE PROFILE CHECK
router.post(
  "/complete-profile-check",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const id = req.user?.id || req.user?.seller_id;

      if (!id) {
        return res.status(401).json({
          message: "Unauthorized",
          isSeller: false,
          error: true,
        });
      }

      const seller = await SellerV2.findByPk(id);

      if (!seller) {
        return res.status(404).json({
          message: "Seller not found in V2",
          isSeller: false,
          error: true,
        });
      }

      const isTemporary =
        !seller.shop_name ||
        seller.shop_name.startsWith("dwkan-") ||
        seller.shop_name.startsWith("shop-");

      const isProfileIncomplete =
        isTemporary ||
        seller.phone === null ||
        seller.name === null ||
        seller.terms_accepted_at === null;

      if (isProfileIncomplete) {
        return res.status(200).json({
          message: "Seller found - profile incomplete",
          seller,
          shop_name: isTemporary ? null : seller.shop_name,
          isSeller: true,
          completedProfile: false,
          error: false,
        });
      }

      return res.status(200).json({
        message: "Profile completed",
        seller,
        shop_name: seller.shop_name,
        business_type: seller.business_type || "retail",
        isSeller: true,
        completedProfile: true,
        error: false,
      });
    } catch (err) {
      console.error("complete-profile-check error:", err);
      return res.status(500).json({
        message: "Server error",
        isSeller: false,
        error: true,
      });
    }
  },
);

// 2) COMPLETE PROFILE
router.post(
  "/complete-profile",
  jwtVerifySellerToken,
  sellerImageUpload.single("shopImage"),
  async (req, res) => {
    try {
      const id = req.user?.id || req.user?.seller_id;
      const {
        shopName,
        shop_name,
        sellerName,
        sellerNumber,
        theme_colors,
        whatsappNumber,
        brandColor,
        termsAccepted,
        email,
        bio,
        business_type,
      } = req.body;

      const finalShopName = (shopName || shop_name || "").trim().toLowerCase();

      if (!finalShopName || !sellerName || !whatsappNumber) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Missing required fields"],
        });
      }

      if (sellerName.length < 3) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Seller name must be at least 3 characters long"],
        });
      }

      const cleanedWhatsappNumber = whatsappNumber.replace(/\D/g, "");
      if (cleanedWhatsappNumber.length < 10) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Please enter a valid phone number"],
        });
      }

      if (termsAccepted !== "true" && termsAccepted !== true) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["You must accept the terms and conditions."],
        });
      }

      if (isReservedShopName(finalShopName)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["This shop name is reserved. Please choose another."],
        });
      }

      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalShopName)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: [
            "Shop name can only contain lowercase letters, numbers, and single hyphens.",
          ],
        });
      }

      if (finalShopName.length < 3 || finalShopName.length > 25) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Shop name must be between 3 and 25 characters."],
        });
      }

      const existingShop = await SellerV2.findOne({
        where: { shop_name: finalShopName },
      });
      if (existingShop && existingShop.id !== id) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["This shop name is already taken."],
        });
      }

      const seller = await SellerV2.findByPk(id);
      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: ["Seller not found"],
        });
      }

      const emailIsMissing = !seller.email || seller.email === "null";
      if (emailIsMissing && email) {
        const existingEmail = await SellerV2.findOne({
          where: { email: email.trim() },
        });
        if (existingEmail && existingEmail.id !== id) {
          return res.status(400).json({
            success: false,
            error: true,
            message: ["This email is already in use by another account"],
          });
        }
      }

      let imageUrl = seller.shop_image;
      if (req.file) {
        if (seller.shop_image) {
          const oldImageBytes = await getStoredAssetBytes(seller.shop_image);
          await deleteStoredSellerImage(seller.shop_image);
          if (oldImageBytes > 0) {
            await decrementSellerStorage(id, oldImageBytes);
          }
        }

        const { key, sizeBytes } = await uploadSellerImageToR2(req.file, id);
        imageUrl = key;
        if (sizeBytes > 0) {
          await incrementSellerStorage(id, sizeBytes);
        }
      }

      let brandColorPayload = null;
      if (theme_colors) {
        brandColorPayload =
          typeof theme_colors === "string"
            ? JSON.parse(theme_colors)
            : theme_colors;
      } else if (typeof brandColor === "object" && brandColor !== null) {
        brandColorPayload = brandColor;
      } else if (typeof brandColor === "string" && brandColor) {
        brandColorPayload = {
          primary: brandColor,
          bg: "#ffffff",
          text: "#0b0b0f",
        };
      }

      await seller.update({
        name: sellerName,
        phone: whatsappNumber,
        shop_name: finalShopName,
        shop_image: imageUrl,
        brand_color: brandColorPayload || null,
        business_type: business_type || "wholesale",
        terms_accepted_at: toUTC(new Date()),
        bio: bio || null,
        needsManualEmail: false,
        ...(emailIsMissing && email ? { email: email.trim() } : {}),
      });

      sellerToken(
        seller.id,
        seller.email || seller.name,
        seller.shop_name,
        res,
      );

      notifyGoogle(
        `https://${finalShopName}.${BASE_DOMAIN}`,
        "URL_UPDATED",
      ).catch(() => {});

      return res.status(200).json({
        success: true,
        error: false,
        shop_name: finalShopName,
        business_type: seller.business_type,
        message: "Profile completed successfully",
        seller,
      });
    } catch (err) {
      console.error("complete-profile error:", err);
      return res.status(500).json({
        success: false,
        error: true,
        message: ["Server error"],
      });
    }
  },
);

// 3) GET SELLER INFO
router.get("/seller-info", jwtVerifySellerToken, async (req, res) => {
  try {
    const id = req.user?.id || req.user?.seller_id;
    const seller = await SellerV2.findByPk(id);
    if (!seller) {
      return res
        .status(404)
        .json({ error: true, success: false, message: "Seller not found" });
    }

    return res.status(200).json({
      success: true,
      error: false,
      email: seller.email || "",
      sellerName: seller.name,
      sellerNumber: seller.phone || "",
      shopName: seller.shop_name,
      shopImage: seller.shop_image,
      phone: seller.phone,
      business_type: seller.business_type,
      brandColor: seller.brand_color || null,
      socialLinks: seller.social_links || {},
      bio: seller.bio || "",
      shopLocation: seller.shop_location || "",
      category_translations: getCategoryMap(seller),
      defaultShopLang: seller.default_shop_lang || "ku",
      orderType: seller.order_type || "both",
      uiSettings: normalizeUiSettings(seller.ui_settings),
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: true, success: false });
  }
});

// 4) UPDATE SELLER INFO
router.post(
  "/seller-info-update",
  jwtVerifySellerToken,
  sellerSettingsUpload.fields([
    { name: "shop_image", maxCount: 1 },
    { name: "hero_image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const id = req.user?.id || req.user?.seller_id;
      const {
        sellerName,
        shopName,
        whatsappNumber,
        socialLinks,
        brandColor,
        theme_colors,
        bio,
        shopLocation,
        defaultShopLang,
        orderType,
        uiSettings,
        business_type,
      } = req.body;

      const seller = await SellerV2.findByPk(id);
      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      const updateData = {};

      if (sellerName) updateData.name = sellerName;
      if (whatsappNumber) updateData.phone = whatsappNumber;
      if (business_type) updateData.business_type = business_type;

      if (brandColor !== undefined || theme_colors !== undefined) {
        const incomingColor = theme_colors || brandColor;
        updateData.brand_color =
          typeof incomingColor === "string" && incomingColor.startsWith("{")
            ? JSON.parse(incomingColor)
            : incomingColor;
      }

      if (bio !== undefined) updateData.bio = bio || null;
      if (shopLocation !== undefined) {
        updateData.shop_location = shopLocation || null;
      }
      if (defaultShopLang) updateData.default_shop_lang = defaultShopLang;
      if (orderType) updateData.order_type = orderType;

      if (socialLinks) {
        updateData.social_links =
          typeof socialLinks === "string"
            ? JSON.parse(socialLinks)
            : socialLinks;
      }

      const shopImageFile = req.files?.shop_image?.[0] || null;
      if (shopImageFile) {
        if (seller.shop_image) {
          const oldImageBytes = await getStoredAssetBytes(seller.shop_image);
          await deleteStoredSellerImage(seller.shop_image);
          if (oldImageBytes > 0) {
            await decrementSellerStorage(id, oldImageBytes);
          }
        }
        const { key, sizeBytes } = await uploadSellerImageToR2(
          shopImageFile,
          id,
        );
        updateData.shop_image = key;
        if (sizeBytes > 0) {
          await incrementSellerStorage(id, sizeBytes);
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(200).json({
          success: true,
          error: false,
          message: "No changes detected",
          seller,
        });
      }

      await seller.update(updateData);

      return res.status(200).json({
        success: true,
        error: false,
        message: "Seller info updated successfully",
        seller,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        error: true,
        message: "Server error",
      });
    }
  },
);

// 5) GET UI SETTINGS
router.get("/ui-settings", jwtVerifySellerToken, async (req, res) => {
  try {
    const id = req.user?.id || req.user?.seller_id;
    const seller = await SellerV2.findByPk(id, {
      attributes: ["id", "ui_settings"],
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    return res.status(200).json({
      success: true,
      error: false,
      uiSettings: normalizeUiSettings(seller.ui_settings),
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

router.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: true,
      message: "Image is too large. Please upload an image under 12MB.",
    });
  }
  return next(err);
});

export default router;
