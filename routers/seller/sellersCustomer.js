import { Router } from "express";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";
const router = Router();

router.get("/sellers-customer/:shopName", detectSeller, async (req, res) => {
  try {
    const { shopName } = req.params;

    // 1️⃣ Check if requester is a seller
    if (req.isSeller && req.seller) {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: true,
        message: "You are a seller. Redirect to seller dashboard.",
      });
    }

    // 2️⃣ Find seller by shop_name
    const seller = await Seller.findOne({
      where: { shop_name: shopName },
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        isSeller: false,
        message: "Seller shop not found",
      });
    }

    const sellerId = seller.id;

    // 3️⃣ Get seller plan
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    let planStatus = "inactive";
    let planData = null;

    if (sellerPlanRecord) {
      const endDate = new Date(sellerPlanRecord.end_date);
      const currentDate = new Date();
      const threeDaysAfterEnd = new Date(
        endDate.getTime() + 3 * 24 * 60 * 60 * 1000,
      );

      // Check if end_date + 3 days has passed
      if (currentDate > threeDaysAfterEnd) {
        // Update status to inactive
        await sellerPlanRecord.update({ status: false });
        planStatus = "inactive";
      } else if (sellerPlanRecord.status) {
        // If status is true and we haven't passed the 3-day window, keep as active
        planStatus = "active";
      } else {
        planStatus = "inactive";
      }

      // Get plan details
      const plan = await Plan.findByPk(sellerPlanRecord.plan_id);
      planData = plan ? plan.toJSON() : null;
    }

    // 4️⃣ If plan is inactive, return with limited data
    if (planStatus === "inactive") {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: false,
        planStatus: "inactive",
        message: "Seller plan is inactive",
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
        },
        products: [],
        offers: [],
        red_line: seller.red_line || null,
      });
    }

    // 5️⃣ Get all seller offers (only active ones)
    const offers = await SellerOffer.findAll({
      where: {
        seller_id: sellerId,
        is_active: true,
        type_offer: {
          [Op.ne]: "discount_delivery", // 👈 exclude this type
        },
      },
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

    // 6️⃣ Get all seller products
    const products = await Product.findAll({
      where: { seller_id: sellerId },
      attributes: [
        "id",
        "language",
        "titleKu",
        "titleAr",
        "images",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discount_percent",
        "discountType",
        "discountStartDate",
        "discountEndDate",
        "variantPrices",
      ],
    });

    // 7️⃣ Return complete seller data
    res.status(200).json({
      success: true,
      error: false,
      isSeller: false,
      planStatus: "active",
      seller: {
        id: seller.id,
        name: seller.name,
        shop_name: seller.shop_name,
        shop_image: seller.shop_image,
      },
      sellerPlan: planData ? planData.name : "Free",
      products,
      offers,
      red_line: seller.red_line || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      isSeller: false,
      message: "Server error",
    });
  }
});

export default router;
