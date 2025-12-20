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

const router = Router();

router.post(
  "/complete-profile-check",
  jwtVerifySellerToken,
  async (req, res) => {
    console.log("fghfgh");

    const { id, email, isSeller } = req.user;
    console.log(req.user);

    // Additional validation
    if (!id || !email || !isSeller) {
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
      seller.name === null
    ) {
      return res.status(200).json({
        message: "Seller found",
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
  }
);

router.post(
  "/complete-profile",
  jwtVerifySellerToken,
  uploadSellerImage.single("shopImage"),
  async (req, res) => {
    try {
      const { id } = req.user;
      const { shopName, sellerName, whatsappNumber } = req.body;
      console.log(id);

      if (!shopName || !sellerName || !whatsappNumber) {
        return res.status(400).json({
          error: true,
          message: "Missing required fields",
        });
      }

      const seller = await Seller.findByPk(id);

      if (!seller) {
        return res.status(404).json({
          error: true,
          message: "Seller not found",
        });
      }

      let imageUrl = seller.shop_image; // default: keep old image

      // ✅ If new image uploaded
      if (req.file) {
        // 🧹 remove old image if exists
        if (seller.shop_image) {
          deleteFile(seller.shop_image);
        }

        // ✅ save new image
        imageUrl = `/uploads/sellers/${req.file.filename}`;
      }

      await seller.update({
        name: sellerName,
        phone: whatsappNumber,
        shop_name: shopName,
        shop_image: imageUrl,
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
        error: true,
        message: "Server error",
      });
    }
  }
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
    return res.status(200).json({
      success: true,
      error: false,
      sellerName: seller.name,
      shopName: seller.shop_name,
      shopImage: seller.shop_image,
      phone: seller.phone,
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
      const { sellerName, shopName, whatsappNumber } = req.body;

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

      if (shopName && shopName !== seller.shop_name) {
        updateData.shop_name = shopName;
      }

      if (whatsappNumber && whatsappNumber !== seller.phone) {
        updateData.phone = whatsappNumber;
      }

      // 🖼️ Handle image update
      if (req.file) {
        if (seller.shop_image) {
          deleteFile(seller.shop_image); // remove old image
        }
        updateData.shop_image = `/uploads/sellers/${req.file.filename}`;
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
  }
);


export default router;
