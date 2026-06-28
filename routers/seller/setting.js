//complete-profile-check
//complete-profile
//seller-info
//seller-info-update

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/seller.js";
import crypto from "crypto";
import { sellerToken, shortSellerToken } from "../../utils/addingToken.js";
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

router.post(
  "/complete-profile-check",
  jwtVerifySellerToken,
  async (req, res) => {
    const { id, isSeller } = req.user;

    // Additional validation
    if (!id || !isSeller) {
      return res.status(401).json({
        message: "Unauthorized",
        isSeller: false,
        error: true,
      });
    }

    const seller = await Seller.findByPk(id);

    if (!seller) {
      return res.status(404).json({
        message: "Seller not found",
        isSeller: false,
        error: true,
      });
    }
    if (
      seller.phone === null ||
      seller.shop_name === null ||
      seller.name === null ||
      seller.terms_accepted_at === null ||
      seller.email === null
    ) {
      return res.status(200).json({
        message: "Seller found",
        seller,
        isSeller: true,
        completedProfile: false,
        error: false,
      });
    }
    return res.status(200).json({
      message: "Seller found",
      isSeller: true,
      completedProfile: true,
      error: false,
    });
  },
);

router.post(
  "/complete-profile",
  jwtVerifySellerToken,
  sellerImageUpload.single("shopImage"),
  async (req, res) => {
    try {
      const { id } = req.user;
      const {
        shopName,
        sellerName,
        sellerNumber,
        whatsappNumber,
        brandColor,
        termsAccepted,
        email,
        bio,
      } = req.body;
console.log("we are here:")
      if (!shopName || !sellerName || !whatsappNumber) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Missing required fields"],
        });
      }

      // Validate sellerName length
      if (sellerName.length < 4) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Seller name must be at least 4 characters long"],
        });
      }

      // Validate sellerNumber only contains digits
      if (sellerNumber && !/^\d+$/.test(sellerNumber)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Seller number must only contain numbers"],
        });
      }

      // Validate whatsappNumber is exactly 11 digits
      const cleanedWhatsappNumber = whatsappNumber.replace(/\D/g, "");
      if (cleanedWhatsappNumber.length !== 11) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["WhatsApp number must be exactly 11 digits"],
        });
      }

      // Check if terms are accepted
      if (termsAccepted !== "true" && termsAccepted !== true) {
        return res.status(400).json({
          success: false,
          error: true,
          message: [
            "You must accept the terms and conditions to create your seller profile.",
          ],
        });
      }

      // Check for reserved shop names
      if (isReservedShopName(shopName)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: [
            "This shop name is reserved and cannot be used. Please choose a different name.",
          ],
        });
      }

      // Only allow lowercase letters, numbers, and hyphens in new shop names
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(shopName)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: [
            "Shop name can only contain lowercase letters, numbers, and hyphens (no leading/trailing/double hyphens).",
          ],
        });
      }

      if (shopName.length < 3 || shopName.length > 25) {
        return res.status(400).json({
          success: false,
          error: true,
          message: ["Shop name must be between 3 and 25 characters."],
        });
      }

      // Check if shop name is already taken by another seller
      const existingShop = await Seller.findOne({
        where: { shop_name: shopName },
      });
      if (existingShop && existingShop.id !== id) {
        return res.status(400).json({
          success: false,
          error: true,
          message: [
            "This shop name is already taken. Please choose a different name.",
          ],
        });
      }

      const seller = await Seller.findByPk(id);

      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      // Helper: treat both actual null and the string "null" as missing
      const emailIsMissing = (val) =>
        val === null || val === "null" || val === "" || val === undefined;

      // If seller has no email, validate and set the provided one
      if (emailIsMissing(seller.email)) {
        if (!email) {
          return res.status(400).json({
            success: false,
            error: true,
            message: ["Email is required"],
          });
        }

        // Check if email is already taken by another seller
        const existingEmail = await Seller.findOne({
          where: { email },
        });

        if (existingEmail && existingEmail.id !== id) {
          return res.status(400).json({
            success: false,
            error: true,
            message: ["This email is already in use by another account"],
          });
        }
      }

      // Clean up string "null" left by Facebook auth — normalize to real null
      if (seller.email === "null") {
        await seller.update({ email: null });
        seller.email = null;
      }

      let imageUrl = seller.shop_image; // default: keep old image

      // If new image uploaded
      if (req.file) {
        // remove old image if exists
        if (seller.shop_image) {
          const oldImageBytes = await getStoredAssetBytes(seller.shop_image);
          await deleteStoredSellerImage(seller.shop_image);
          if (oldImageBytes > 0) {
            await decrementSellerStorage(id, oldImageBytes);
          }
        }

        const { key, sizeBytes } = await uploadSellerImageToR2(req.file, id);
        imageUrl = key;
        const newImageBytes = sizeBytes;
        if (newImageBytes > 0) {
          await incrementSellerStorage(id, newImageBytes);
        }
      }

      await seller.update({
        name: sellerName,
        phone: whatsappNumber,
        shop_name: shopName,
        shop_image: imageUrl,
        brand_color: brandColor || null,
        seller_number: sellerNumber || null,
        terms_accepted_at: toUTC(new Date()),
        bio: bio || null,
        // Only update email if it was null — never overwrite an existing email
        // Only update email if it was missing — never overwrite a real email
        ...(emailIsMissing(seller.email) && email ? { email } : {}),
      });

      // Fire-and-forget: notify Google to index the new shop homepage.
      notifyGoogle(`https://${shopName}.${BASE_DOMAIN}`, "URL_UPDATED").catch(
        () => {},
      );

      return res.status(200).json({
        success: true,
        error: false,
        shop_name: shopName,
        message: "Profile completed successfully",
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

router.get("/seller-info", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const seller = await Seller.findByPk(id);
    if (!seller) {
      return res
        .status(404)
        .json({ error: true, success: false, message: "Seller not found" });
    }
    console.log("sss", seller);

    return res.status(200).json({
      success: true,
      error: false,
      email: seller.email || "",
      sellerName: seller.name,
      sellerNumber: seller.phone || "",
      shopName: seller.shop_name,
      shopImage: seller.shop_image,
      phone: seller.phone,
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

router.post(
  "/seller-info-update",
  jwtVerifySellerToken,
  sellerSettingsUpload.fields([
    { name: "shop_image", maxCount: 1 },
    { name: "hero_image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.user;
      const {
        sellerName,
        sellerNumber,
        shopName,
        whatsappNumber,
        socialLinks,
        brandColor,
        bio,
        shopLocation,
        defaultShopLang,
        orderType,
        uiSettings,
      } = req.body;

      // Validate sellerName length if provided
      if (sellerName && sellerName.length < 4) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Seller name must be at least 4 characters long",
        });
      }

      // Validate sellerNumber only contains digits if provided
      if (sellerNumber && !/^\d+$/.test(sellerNumber)) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Seller number must only contain numbers",
        });
      }

      // Validate whatsappNumber is exactly 11 digits if provided
      if (whatsappNumber) {
        const cleanedWhatsappNumber = whatsappNumber.replace(/\D/g, "");
        if (cleanedWhatsappNumber.length !== 11) {
          return res.status(400).json({
            success: false,
            error: true,
            message: "WhatsApp number must be exactly 11 digits",
          });
        }
      }

      // Check for reserved shop names
      if (shopName && isReservedShopName(shopName)) {
        return res.status(400).json({
          success: false,
          error: true,
          message:
            "This shop name is reserved and cannot be used. Please choose a different name.",
        });
      }

      const seller = await Seller.findByPk(id);
      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      /* =======================
         PREPARE UPDATE OBJECT
      ======================= */

      const updateData = {};

      if (sellerName && sellerName !== seller.name) {
        updateData.name = sellerName;
      }

      if (sellerNumber && sellerNumber !== seller.seller_number) {
        updateData.seller_number = sellerNumber;
      }

      if (shopName && shopName !== seller.shop_name) {
        // Only allow lowercase letters, numbers, and hyphens in new shop names
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(shopName)) {
          return res.status(400).json({
            success: false,
            error: true,
            message:
              "Shop name can only contain lowercase letters, numbers, and hyphens (no leading/trailing/double hyphens).",
          });
        }
        if (shopName.length < 3 || shopName.length > 25) {
          return res.status(400).json({
            success: false,
            error: true,
            message: "Shop name must be between 3 and 25 characters.",
          });
        }
        // Check if shop name is already taken by another seller
        const takenShop = await Seller.findOne({
          where: { shop_name: shopName },
        });
        if (takenShop && takenShop.id !== id) {
          return res.status(400).json({
            success: false,
            error: true,
            message:
              "This shop name is already taken. Please choose a different name.",
          });
        }
        updateData.shop_name = shopName;
      }

      if (whatsappNumber && whatsappNumber !== seller.phone) {
        updateData.phone = whatsappNumber;
      }

      // Handle brand color update
      // brandColor can be empty string (to reset to default/null) or a color value
      if (brandColor !== undefined) {
        const newBrandColor = brandColor === "" ? null : brandColor;
        if (newBrandColor !== seller.brand_color) {
          updateData.brand_color = newBrandColor;
        }
      }

      // � Handle social media links update
      if (socialLinks) {
        const parsedSocialLinks =
          typeof socialLinks === "string"
            ? JSON.parse(socialLinks)
            : socialLinks;

        const currentSocialLinks = seller.social_links || {};
        const updatedSocialLinks = {
          ...currentSocialLinks,
          ...parsedSocialLinks,
        };
        updateData.social_links = updatedSocialLinks;
      }

      const shopImageFile = req.files?.shop_image?.[0] || null;
      const heroImageFile = req.files?.hero_image?.[0] || null;

      // Handle main shop image update
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
        const newImageBytes = sizeBytes;
        if (newImageBytes > 0) {
          await incrementSellerStorage(id, newImageBytes);
        }
      }

      const parsedUiSettings = parseUiSettingsPayload(
        uiSettings,
        seller.ui_settings,
      );
      if (uiSettings !== undefined && !parsedUiSettings) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Invalid uiSettings payload",
        });
      }

      if (heroImageFile) {
        const oldHeroImageKey = normalizeUiSettings(seller.ui_settings)
          .heroSection.imageKey;
        if (oldHeroImageKey) {
          const oldHeroBytes = await getStoredAssetBytes(oldHeroImageKey);
          await deleteStoredSellerImage(oldHeroImageKey);
          if (oldHeroBytes > 0) {
            await decrementSellerStorage(id, oldHeroBytes);
          }
        }

        const { key, sizeBytes } = await uploadSellerHeroImageToR2(
          heroImageFile,
          id,
        );
        if (parsedUiSettings) {
          parsedUiSettings.heroSection.imageKey = key;
        }

        if (sizeBytes > 0) {
          await incrementSellerStorage(id, sizeBytes);
        }
      }

      if (parsedUiSettings) {
        if (!parsedUiSettings.heroSection.imageKey) {
          parsedUiSettings.heroSection.enabled = false;
        }
        updateData.ui_settings = parsedUiSettings;
      }
      // Handle bio update
      if (bio !== undefined) {
        const newBio = bio === "" ? null : bio;
        if (newBio !== seller.bio) {
          updateData.bio = newBio;
        }
      }

      // Handle shop location update
      if (shopLocation !== undefined) {
        const newLocation = shopLocation === "" ? null : shopLocation;
        if (newLocation !== seller.shop_location) {
          updateData.shop_location = newLocation;
        }
      }
      // Handle default shop language update
      if (defaultShopLang !== undefined) {
        const validLangs = ["ku", "ar", "en"];
        const newLang = validLangs.includes(defaultShopLang)
          ? defaultShopLang
          : "ku";
        if (newLang !== seller.default_shop_lang) {
          updateData.default_shop_lang = newLang;
        }
      }

      // Handle order type update
      if (orderType !== undefined) {
        const validOrderTypes = ["both", "whatsapp", "websystem"];
        if (!validOrderTypes.includes(orderType)) {
          return res.status(400).json({
            success: false,
            error: true,
            message: "Invalid order type",
          });
        }
        if (orderType !== seller.order_type) {
          updateData.order_type = orderType;
        }
      }
      // 🟡 No changes detected
      if (Object.keys(updateData).length === 0) {
        return res.status(200).json({
          success: true,
          error: false,
          message: "No changes detected",
          seller,
        });
      }

      await seller.update(updateData);

      // Fire-and-forget: notify Google when shop URL changes (new shop_name creates a new subdomain).
      if (updateData.shop_name) {
        const _oldShopName = seller.shop_name;
        const _newShopName = updateData.shop_name;
        if (_oldShopName) {
          notifyGoogle(
            `https://${_oldShopName}.${BASE_DOMAIN}`,
            "URL_DELETED",
          ).catch(() => {});
        }
        notifyGoogle(
          `https://${_newShopName}.${BASE_DOMAIN}`,
          "URL_UPDATED",
        ).catch(() => {});
      }

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

router.get("/ui-settings", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const seller = await Seller.findByPk(id, {
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
    console.error(err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

router.post(
  "/ui-settings",
  jwtVerifySellerToken,
  sellerSettingsUpload.fields([{ name: "hero_image", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { id } = req.user;
      const seller = await Seller.findByPk(id);
      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      const parsedUiSettings = parseUiSettingsPayload(
        req.body.uiSettings,
        seller.ui_settings,
      );
      if (!parsedUiSettings) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Invalid uiSettings payload",
        });
      }

      const heroImageFile = req.files?.hero_image?.[0] || null;
      if (heroImageFile) {
        const oldHeroImageKey = normalizeUiSettings(seller.ui_settings)
          .heroSection.imageKey;
        if (oldHeroImageKey) {
          const oldHeroBytes = await getStoredAssetBytes(oldHeroImageKey);
          await deleteStoredSellerImage(oldHeroImageKey);
          if (oldHeroBytes > 0) {
            await decrementSellerStorage(id, oldHeroBytes);
          }
        }

        const { key, sizeBytes } = await uploadSellerHeroImageToR2(
          heroImageFile,
          id,
        );
        parsedUiSettings.heroSection.imageKey = key;
        if (sizeBytes > 0) {
          await incrementSellerStorage(id, sizeBytes);
        }
      }

      if (!parsedUiSettings.heroSection.imageKey) {
        parsedUiSettings.heroSection.enabled = false;
      }

      await seller.update({ ui_settings: parsedUiSettings });

      return res.status(200).json({
        success: true,
        error: false,
        message: "UI settings updated successfully",
        uiSettings: normalizeUiSettings(parsedUiSettings),
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

router.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: true,
      message: "Image is too large. Please upload an image under 12MB.",
      field: err.field || null,
      code: err.code,
    });
  }
  return next(err);
});

export default router;
