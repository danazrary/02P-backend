import { Router } from "express";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import SellerOffer from "../../database/sellerOffer.js";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
const router = Router();

router.get("/sellers-customer/:shopName", detectSeller, async (req, res) => {
  console.log("11111111");

  try {
    const { shopName } = req.params;

    // 1️⃣ Check if requester is a seller
    if (req.isSeller && req.seller) {
      const findSeller = await Seller.findByPk(req.seller.id, {
        attributes: ["shop_name"],
      });

      return res.status(200).json({
        success: true,
        error: false,
        isSeller: true,
        shopName: findSeller ? findSeller.shop_name : null,
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
        shopName: shopName || null,
        message: "Seller shop not found",
      });
    }

    const sellerId = seller.id;
    const currentDate = new Date();

    // 3️⃣ Get seller plan
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    // If no plan exists, shop is closed
    if (!sellerPlanRecord) {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: false,
        yourShopClose: true,
        closeReason: "no_plan",
        message: "This shop is currently closed",
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
        },
      });
    }

    // Get plan details
    const plan = await Plan.findByPk(sellerPlanRecord.plan_id);
    const planName = plan ? plan.name : "";

    // Check if plan is free_seller - shop is closed for customers
    if (
      planName === "free_seller" ||
      planName === "Free" ||
      sellerPlanRecord.plan_id === 1
    ) {
      return res.status(200).json({
        success: true,
        error: false,
        isSeller: false,
        yourShopClose: true,
        closeReason: "free_plan",
        message: "This shop is currently closed",
        seller: {
          id: seller.id,
          name: seller.name,
          shop_name: seller.shop_name,
          shop_image: seller.shop_image,
        },
      });
    }

    // Check if plan is trial_seller
    if (planName === "trial_seller" || sellerPlanRecord.plan_id === 9) {
      const endDate = new Date(sellerPlanRecord.end_date);
      const timeDiff = currentDate - endDate;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      // If trial ended more than 1 day ago, shop is closed
      if (endDate < currentDate && daysDiff > 1) {
        return res.status(200).json({
          success: true,
          error: false,
          isSeller: false,
          yourShopClose: true,
          closeReason: "trial_expired",
          message: "This shop is currently closed",
          seller: {
            id: seller.id,
            name: seller.name,
            shop_name: seller.shop_name,
            shop_image: seller.shop_image,
          },
        });
      }
    }

    // Check paid plans - if expired more than 1 day, shop is closed
    if (
      planName !== "free_seller" &&
      planName !== "Free" &&
      planName !== "trial_seller" &&
      sellerPlanRecord.plan_id !== 1 &&
      sellerPlanRecord.plan_id !== 9
    ) {
      const endDate = new Date(sellerPlanRecord.end_date);
      const timeDiff = currentDate - endDate;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      if (endDate < currentDate && daysDiff > 1) {
        return res.status(200).json({
          success: true,
          error: false,
          isSeller: false,
          yourShopClose: true,
          closeReason: "plan_expired",
          message: "This shop is currently closed",
          seller: {
            id: seller.id,
            name: seller.name,
            shop_name: seller.shop_name,
            shop_image: seller.shop_image,
          },
        });
      }
    }

    // 5️⃣ Get all seller offers (only active ones)
    const allOffers = await SellerOffer.findAll({
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

    // Filter and delete expired or not-yet-started offers
    const offers = [];
    for (const offer of allOffers) {
      const startDate = new Date(offer.start_date);
      const endDate = new Date(offer.end_date);

      if (endDate < currentDate) {
        // Delete expired offer from database
        await SellerOffer.destroy({
          where: { id: offer.id },
        });
        console.log(`🗑️ Deleted expired offer ${offer.id}`);
      } else if (startDate <= currentDate && endDate >= currentDate) {
        // Only show offers that have started and haven't ended
        offers.push(offer);
      }
    }

    // 6️⃣ Get all seller products
    let products = await Product.findAll({
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
        "freeDeliveryStartDate",
        "freeDeliveryEndDate",
        "free_delivery",
        "variantPrices",
        "variantPricesAr",
      ],
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    // Check red_line expiration and start time, remove if expired
    let redLine = null;
    if (seller.red_line) {
      try {
        const redLineData =
          typeof seller.red_line === "string"
            ? JSON.parse(seller.red_line)
            : seller.red_line;

        // Check if red_line has proper structure
        if (
          redLineData &&
          typeof redLineData === "object" &&
          redLineData.end_time &&
          redLineData.start_time
        ) {
          const startTime = new Date(redLineData.start_time);
          const endTime = new Date(redLineData.end_time);

          // If expired, remove from database immediately
          if (endTime < currentDate) {
            await Seller.update(
              { red_line: null },
              { where: { id: sellerId } },
            );
            console.log(`🗑️ Removed expired red_line for seller ${sellerId}`);
          } else if (startTime <= currentDate && endTime >= currentDate) {
            // Only show if started and not ended
            redLine = redLineData;
          }
          // If not started yet (startTime > currentDate), don't show but don't remove
        } else {
          // Invalid structure, remove it
          await Seller.update({ red_line: null }, { where: { id: sellerId } });
        }
      } catch (error) {
        console.error(
          "Error parsing red_line for seller",
          sellerId,
          ":",
          error,
        );
        // If parsing fails, remove invalid data
        await Seller.update({ red_line: null }, { where: { id: sellerId } });
      }
    }

    // 7️⃣ Return complete seller data
    res.status(200).json({
      success: true,
      error: false,
      isSeller: false,
      yourShopClose: false,
      seller: {
        id: seller.id,
        name: seller.name,
        shop_name: seller.shop_name,
        shop_image: seller.shop_image,
      },
      sellerPlan: plan ? plan.name : "Free",
      brand_color: seller.brand_color || null,
      products,
      offers,
      red_line: redLine,
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
