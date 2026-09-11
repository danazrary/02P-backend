// backend/routes/seller/deleteAccount.js
import { Router } from "express";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import SellerV2 from "../../database/sellerv2.js";
import Product from "../../database/products.js";
import SellerOffer from "../../database/sellerOffer.js";
import SellerPlan from "../../database/sellerPlan.js";
import { deleteFile } from "../../utils/deleteFile.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
import { deleteFromR2 } from "../../utils/r2.js";

const router = Router();

function isLegacyUploadPath(value) {
  return value?.startsWith("/uploads/") || value?.startsWith("uploads/");
}

async function deleteStoredAsset(pathOrKey) {
  if (!pathOrKey) return;
  if (isLegacyUploadPath(pathOrKey)) {
    deleteFile(pathOrKey);
    return;
  }
  await deleteFromR2(pathOrKey);
}

// 1) DELETE /delete-account
router.delete("/delete-account", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.seller_id;
    const seller = await SellerV2.findByPk(sellerId);

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    await seller.update({ deletion_requested_at: new Date() });
    res.clearCookie("s_t", clearCookieOpts());

    return res.json({
      success: true,
      message:
        "Account deletion scheduled. Your data will be permanently removed after 30 days.",
      deletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return res
      .status(500)
      .json({
        success: false,
        error: true,
        message: "Server error. Please try again.",
      });
  }
});

// 2) POST /cancel-deletion
router.post("/cancel-deletion", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.seller_id;
    const seller = await SellerV2.findByPk(sellerId);

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
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
    return res
      .status(500)
      .json({
        success: false,
        error: true,
        message: "Server error. Please try again.",
      });
  }
});

// 3) Permanent delete helper
export async function permanentlyDeleteSellerAccount(sellerId) {
  try {
    const seller = await SellerV2.findByPk(sellerId);
    if (!seller) return { success: false, message: "Seller not found" };

    const products = await Product.findAll({ where: { seller_id: sellerId } });
    for (const product of products) {
      if (product.images && Array.isArray(product.images)) {
        for (const img of product.images) {
          deleteFile(img);
        }
      }
    }
    await Product.destroy({ where: { seller_id: sellerId } });

    const offers = await SellerOffer.findAll({
      where: { seller_id: sellerId },
    });
    for (const offer of offers) {
      if (offer.cover_image) {
        await deleteStoredAsset(offer.cover_image);
      }
    }
    await SellerOffer.destroy({ where: { seller_id: sellerId } });
    await SellerPlan.destroy({ where: { seller_id: sellerId } });

    if (seller.shop_image) {
      await deleteStoredAsset(seller.shop_image);
    }

    await seller.destroy();
    return { success: true, message: "Account deleted permanently" };
  } catch (error) {
    console.error("Permanent delete error:", error);
    return { success: false, message: error.message };
  }
}

export default router;
