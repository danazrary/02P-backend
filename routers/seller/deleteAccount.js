// backend/routes/seller/deleteAccount.js
import { Router } from "express";
import Seller from "../../database/sellerv2.js";
// "deleteAccount" is an owner-only permission: no staff role (not even admin) can ever have it
import { canDeleteAccount } from "../../middlewares/staffPermissions.js";
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

// 1) DELETE /delete-account — تەنها خاوەنی فرۆشگا
router.delete("/delete-account", canDeleteAccount, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const seller = await Seller.findByPk(sellerId);

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
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error. Please try again.",
    });
  }
});

// 2) POST /cancel-deletion — تەنها خاوەنی فرۆشگا
router.post("/cancel-deletion", canDeleteAccount, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const seller = await Seller.findByPk(sellerId);

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
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error. Please try again.",
    });
  }
});

// 3) Permanent delete helper
export async function permanentlyDeleteSellerAccount(sellerId) {
  try {
    const seller = await Seller.findByPk(sellerId);
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
