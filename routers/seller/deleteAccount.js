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

// Request account deletion (sets 30-day timer)
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

    // Set deletion timer to current date - account will be deleted after 30 days
    await seller.update({ deletion_requested_at: new Date() });

    // Clear the session cookie
    res.clearCookie("s_t", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    return res.json({
      success: true,
      message:
        "Account deletion scheduled. Your data will be permanently removed after 30 days.",
      deletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

// Cancel account deletion (resets timer)
router.post("/cancel-deletion", jwtVerifySellerToken, async (req, res) => {
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

    if (!seller.deletion_requested_at) {
      return res.json({
        success: true,
        message: "No pending deletion to cancel",
      });
    }

    await seller.update({ deletion_requested_at: null });

    return res.json({
      success: true,
      message: "Account deletion cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel deletion error:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error. Please try again.",
    });
  }
});

// Permanently delete a seller account and all related data (used by cleanup job)
export async function permanentlyDeleteSellerAccount(sellerId) {
  try {
    const seller = await Seller.findByPk(sellerId);
    if (!seller) {
      return { success: false, message: "Seller not found" };
    }

    // Delete product images, then product records
    const products = await Product.findAll({ where: { seller_id: sellerId } });
    for (const product of products) {
      if (product.images && Array.isArray(product.images)) {
        for (const img of product.images) {
          deleteFile(img);
        }
      }
    }
    await Product.destroy({ where: { seller_id: sellerId } });

    // Delete offer cover images, then offer records
    const offers = await SellerOffer.findAll({
      where: { seller_id: sellerId },
    });
    for (const offer of offers) {
      if (offer.cover_image) {
        deleteFile(offer.cover_image);
      }
    }
    await SellerOffer.destroy({ where: { seller_id: sellerId } });

    // Delete seller plan records
    await SellerPlan.destroy({ where: { seller_id: sellerId } });

    // Delete seller shop image
    if (seller.shop_image) {
      deleteFile(seller.shop_image);
    }

    // Delete the seller record
    await seller.destroy();

    return { success: true, message: "Account deleted permanently" };
  } catch (error) {
    console.error("Permanent delete error:", error);
    return { success: false, message: error.message };
  }
}

export default router;
