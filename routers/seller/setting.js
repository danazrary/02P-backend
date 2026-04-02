//complete-profile-check
//complete-profile
//seller-info
//seller-info-update

import { Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/seller.js";
import crypto from "crypto";
import { sellerToken, shortSellerToken } from "../../utils/addingToken.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { deleteFile } from "../../utils/deleteFile.js";
import { uploadSellerImage } from "../../middlewares/uploadSellerImage.js";
import { getImageUrlPath } from "../../utils/uploadHandler.js";
import { isReservedShopName } from "../../utils/reservedShopNames.js";
import { toUTC } from "../../utils/timezoneHandler.js";

const router = Router();

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
  uploadSellerImage.single("shopImage"),
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
      } = req.body;

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
          deleteFile(seller.shop_image);
        }

        // save new image with environment-aware path
        imageUrl = getImageUrlPath("sellers", req.file.filename);
      }

      await seller.update({
        name: sellerName,
        phone: whatsappNumber,
        shop_name: shopName,
        shop_image: imageUrl,
        brand_color: brandColor || null,
        seller_number: sellerNumber || null,
        terms_accepted_at: toUTC(new Date()),
        // Only update email if it was null — never overwrite an existing email
        // Only update email if it was missing — never overwrite a real email
        ...(emailIsMissing(seller.email) && email ? { email } : {}),
      });

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
  uploadSellerImage.single("shop_image"), // must match FormData
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

      // �🖼️ Handle image update
      if (req.file) {
        if (seller.shop_image) {
          deleteFile(seller.shop_image); // remove old image
        }
        updateData.shop_image = getImageUrlPath("sellers", req.file.filename);
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

export default router;
