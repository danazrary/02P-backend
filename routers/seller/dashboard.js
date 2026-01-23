import { Router } from "express";

import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import Report from "../../database/report.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import SellerOffer from "../../database/sellerOffer.js";
const router = Router();

router.get("/dashboard", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    console.log(id);

    const seller = await Seller.findByPk(id);
    console.log(seller);

    if (!seller) {
      res.clearCookie("s_t", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
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
        start_date: new Date(),
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        is_trial: false,
        is_active: false,
      });
    }

    const sellerPlanRow = await Plan.findByPk(sellerPlanRecord.plan_id);

    // 🔹 get plan name
    // const plan = await Plan.findByPk(sellerPlanRow.plan_id);

    const offers = await SellerOffer.findAll({
      where: { seller_id: id, is_active: true },
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "cover_image",
        "type_offer",
        "start_date",
        "end_date",
        "language",
        "discount_price_type",
        "discount_price",
        "discount_percent",
        "discount_or_free_delivery",
      ],
    });
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
        "discountStartDate",
        "discountEndDate",
      ],
    });

    res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlanRow ? sellerPlanRow.name : "Free",
      red_line: seller.red_line || null,
      products,
      offers,
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
