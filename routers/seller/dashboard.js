import { Router } from "express";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";

const router = Router();

router.get("/dashboard", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;

    const seller = await Seller.findByPk(id);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: id },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: id,
        plan_id: 1, // Free plan
        starts_at: new Date(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        is_trial: false,
        is_active: false,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.id);

    // 🔹 get plan name
    // const plan = await Plan.findByPk(sellerPlanRow.plan_id);

    const products = await Product.findAll({
      where: { seller_id: id },
      attributes: [
        "id",
        "language",
        "titleKu",
        "titleAr",
        "images",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discountPrice",
        "discountType",
        "discountDays",
        "discountHours",
        "discountMinutes",
      ],
    });

    res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      products,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

export default router;
