import { Router } from "express";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  Seller,
  Product,
  SellerOffer,
  SellerPlan,
} from "../../database/index.js";
import { deleteFile } from "../../utils/deleteFile.js";

const router = Router();

router.delete("/delete-account", jwtVerifySellerToken, async (req, res) => {
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

    // Delete product images, then product records
    const products = await Product.findAll({ where: { seller_id: id } });
    for (const product of products) {
      if (product.images && Array.isArray(product.images)) {
        for (const img of product.images) {
          deleteFile(img);
        }
      }
    }
    await Product.destroy({ where: { seller_id: id } });

    // Delete offer cover images, then offer records
    const offers = await SellerOffer.findAll({ where: { seller_id: id } });
    for (const offer of offers) {
      if (offer.cover_image) {
        deleteFile(offer.cover_image);
      }
    }
    await SellerOffer.destroy({ where: { seller_id: id } });

    // Delete seller plan records
    await SellerPlan.destroy({ where: { seller_id: id } });

    // Delete seller shop image
    if (seller.shop_image) {
      deleteFile(seller.shop_image);
    }

    // Delete the seller record
    await seller.destroy();

    // Clear the session cookie
    res.clearCookie("s_t", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error. Please try again.",
    });
  }
});

export default router;
