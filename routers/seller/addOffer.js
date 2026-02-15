import express from "express";
import SellerOffer from "../../database/sellerOffer.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import {
  uploadOffers,
  getImageUrlPath,
  deleteImage,
} from "../../utils/uploadHandler.js";

const router = express.Router();

// Use centralized upload middleware that handles environment-based storage
// In development (NODE_ENV=development): saves to backend/uploads/offers
// In production (NODE_ENV=production): saves to VPS_UPLOAD_PATH/offers
const upload = uploadOffers;

// Route to create offer
router.post(
  "/add-offer",
  jwtVerifySellerToken,
  upload.single("coverImage"),
  async (req, res) => {
    try {
      const { id } = req.user;

      // Check seller plan and offer limit
      const sellerPlan = await SellerPlan.findOne({
        where: { seller_id: id },
      });

      if (!sellerPlan) {
        return res.status(403).json({
          success: false,
          error: true,
          message: "No plan found for this seller",
        });
      }

      const plan = await Plan.findByPk(sellerPlan.plan_id);

      // Check if free plan - don't allow adding offers
      if (
        sellerPlan.plan_id === 1 ||
        plan?.name === "free_seller" ||
        plan?.name === "Free"
      ) {
        return res.status(403).json({
          success: false,
          error: true,
          free_plan: true,
          message: "Free plan cannot add offers. Please upgrade your plan.",
        });
      }

      const maxOffers = plan ? plan.max_offers : 0;

      const currentOfferCount = await SellerOffer.count({
        where: { seller_id: id, is_active: true },
      });

      if (currentOfferCount >= maxOffers) {
        return res.status(403).json({
          success: false,
          error: true,
          limit_reached: true,
          message:
            "Offer limit reached. Please upgrade your plan or remove existing offers.",
        });
      }

      const {
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        start_date,
        end_date,
        discount_or_free_delivery,
        discount_price_type,
        discount_price,
        discount_percent,
        buy_product_id_quantity,
        get_product_id_quantity,
        fixed_or_percentage,
        apply_to,
      } = req.body;
      console.log("data", req.body, "data end");

      // const { id } = req.user;

      // Save uploaded cover image path using environment-aware path
      const cover_image = req.file
        ? getImageUrlPath("offers", req.file.filename)
        : null;

      const offer = await SellerOffer.create({
        seller_id: id,
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        cover_image,
        start_date,
        end_date,
        discount_or_free_delivery: discount_or_free_delivery || null,
        discount_price_type:
          fixed_or_percentage === "percentage"
            ? null
            : discount_price_type || null,
        discount_price:
          fixed_or_percentage === "percentage" ? null : discount_price || null,
        discount_percent:
          fixed_or_percentage === "fixed" ? null : discount_percent || null,
        apply_to: apply_to || null,
        buy_product_id_quantity: buy_product_id_quantity
          ? JSON.parse(buy_product_id_quantity)
          : null,
        get_product_id_quantity: get_product_id_quantity
          ? JSON.parse(get_product_id_quantity)
          : null,
      });

      res.status(201).json({
        success: true,
        error: false,
        message: "Offer created successfully",
        offer,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to create offer",
      });
    }
  },
);

// Route to edit offer
router.put(
  "/edit-offer/:offerId",
  jwtVerifySellerToken,
  upload.single("coverImage"),
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { offerId } = req.params;

      const offer = await SellerOffer.findOne({
        where: { id: offerId, seller_id: sellerId },
      });

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Offer not found",
        });
      }

      const {
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        start_date,
        end_date,
        discount_or_free_delivery,
        discount_price_type,
        discount_price,
        discount_percent,
        buy_product_id_quantity,
        get_product_id_quantity,
        apply_to,
      } = req.body;

      // Delete old cover image if new one is uploaded
      if (req.file && offer.cover_image) {
        deleteImage(offer.cover_image);
      }

      const cover_image = req.file
        ? getImageUrlPath("offers", req.file.filename)
        : offer.cover_image;

      await offer.update({
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        cover_image,
        start_date,
        end_date,
        discount_or_free_delivery: discount_or_free_delivery || null,
        discount_price_type: discount_price_type || null,
        discount_price: discount_price || null,
        discount_percent: discount_percent || null,
        apply_to: apply_to || null,
        buy_product_id_quantity: buy_product_id_quantity
          ? JSON.parse(buy_product_id_quantity)
          : null,
        get_product_id_quantity: get_product_id_quantity
          ? JSON.parse(get_product_id_quantity)
          : null,
      });

      res.status(200).json({
        success: true,
        error: false,
        message: "Offer updated successfully",
        offer,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to update offer",
      });
    }
  },
);

// Route to delete offer
router.delete(
  "/delete-offer/:offerId",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { offerId } = req.params;

      const offer = await SellerOffer.findOne({
        where: { id: offerId, seller_id: sellerId },
      });

      if (!offer) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Offer not found",
        });
      }

      // Delete cover image from disk
      if (offer.cover_image) {
        deleteImage(offer.cover_image);
      }

      await offer.destroy();

      res.status(200).json({
        success: true,
        error: false,
        message: "Offer deleted successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to delete offer",
      });
    }
  },
);
// get offer details
router.get("/offer-details/:offerId", async (req, res) => {
  try {
    const { offerId } = req.params;
    const offer = await SellerOffer.findByPk(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Offer not found",
      });
    }

    let getBuyProductsDetails;
    let getGetProductsDetails;
    if (offer.buy_product_id_quantity) {
      getBuyProductsDetails = await Promise.all(
        offer.buy_product_id_quantity.map(async (item) => {
          const product = await Product.findByPk(item.id);
          return { ...item, product };
        }),
      );

      // Check if all products were deleted
      const allProductsDeleted = getBuyProductsDetails.every(
        (item) => item.product === null,
      );
      if (allProductsDeleted && getBuyProductsDetails.length > 0) {
        // Delete offer if all products are gone
        await offer.destroy();
        return res.status(404).json({
          success: true,
          error: false,
          offerIsDeleted: true,
          message: "Offer deleted - all referenced products were removed",
        });
      }
    }

    if (offer.get_product_id_quantity) {
      getGetProductsDetails = await Promise.all(
        offer.get_product_id_quantity.map(async (item) => {
          const product = await Product.findByPk(item.id);
          return { ...item, product };
        }),
      );

      // Check if all products were deleted
      const allProductsDeleted = getGetProductsDetails.every(
        (item) => item.product === null,
      );
      if (allProductsDeleted && getGetProductsDetails.length > 0) {
        // Delete offer if all products are gone
        await offer.destroy();
        return res.status(404).json({
          success: false,
          error: true,
          message: "Offer deleted - all referenced products were removed",
        });
      }
    }

    res.status(200).json({
      success: true,
      error: false,
      offer,
      getBuyProductsDetails,
      getGetProductsDetails,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
