import express from "express";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import SellerOffer from "../../database/sellerOffer.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import { toUTC } from "../../utils/timezoneHandler.js";
import {
  r2Multer,
  buildR2Key,
  uploadToR2,
  deleteFromR2,
} from "../../utils/r2.js";
import {
  checkStorageLimit,
  incrementSellerStorage,
  decrementSellerStorage,
} from "../../middlewares/checkStorageLimit.js";

const router = express.Router();
const MAX_OFFER_IMAGE_BYTES = 25 * 1024 * 1024;

async function validateOfferCoverImage(file) {
  if (!file) return null;

  if (file.size > MAX_OFFER_IMAGE_BYTES) {
    return "Offer cover image must be 25MB or smaller.";
  }

  try {
    const metadata = await sharp(file.buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (!width || !height) {
      return "Offer cover image is invalid. Please choose another image.";
    }
  } catch (err) {
    return "Offer cover image is invalid. Please choose another image.";
  }

  return null;
}

// Route to create offer
router.post(
  "/add-offer",
  jwtVerifySellerToken,
  r2Multer.single("coverImage"),
  checkStorageLimit,
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

      const imageValidationError = await validateOfferCoverImage(req.file);
      if (imageValidationError) {
        return res.status(400).json({
          success: false,
          error: true,
          message: imageValidationError,
        });
      }

      // const { id } = req.user;

      // Upload cover image to R2
      let cover_image = null;
      let coverImageBytes = 0;
      if (req.file) {
        const offerKey = buildR2Key("offers", id, uuidv4(), "cover.webp");
        const { sizeBytes } = await uploadToR2(req.file.buffer, offerKey, {
          width: 1920,
          height: 1080,
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          qualities: [90, 86, 82, 78],
          maxOutputBytes: 3 * 1024 * 1024,
          withoutEnlargement: false,
        });
        cover_image = offerKey;
        coverImageBytes = sizeBytes;
      }

      // ⚠️ IMPORTANT: Convert dates to UTC before storing in database
      const utcStartDate = toUTC(start_date);
      const utcEndDate = toUTC(end_date);

      const offer = await SellerOffer.create({
        seller_id: id,
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        cover_image,
        cover_image_size_bytes: coverImageBytes,
        start_date: utcStartDate,
        end_date: utcEndDate,
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

      if (coverImageBytes > 0) {
        await incrementSellerStorage(id, coverImageBytes);
      }

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
  r2Multer.single("coverImage"),
  checkStorageLimit,
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

      const imageValidationError = await validateOfferCoverImage(req.file);
      if (imageValidationError) {
        return res.status(400).json({
          success: false,
          error: true,
          message: imageValidationError,
        });
      }

      // Delete old R2 cover image and upload new one
      let cover_image = offer.cover_image;
      let newCoverImageBytes = offer.cover_image_size_bytes || 0;
      if (req.file) {
        if (offer.cover_image) {
          await deleteFromR2(offer.cover_image);
          await decrementSellerStorage(
            sellerId,
            offer.cover_image_size_bytes || 0,
          );
        }
        const offerKey = buildR2Key("offers", sellerId, uuidv4(), "cover.webp");
        const { sizeBytes } = await uploadToR2(req.file.buffer, offerKey, {
          width: 1920,
          height: 1080,
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          qualities: [90, 86, 82, 78],
          maxOutputBytes: 3 * 1024 * 1024,
          withoutEnlargement: false,
        });
        cover_image = offerKey;
        newCoverImageBytes = sizeBytes;
        await incrementSellerStorage(sellerId, sizeBytes);
      }

      // ⚠️ IMPORTANT: Convert dates to UTC before storing in database
      const utcStartDate = toUTC(start_date);
      const utcEndDate = toUTC(end_date);

      await offer.update({
        type_offer,
        language,
        titleAr,
        titleKu,
        descriptionAr,
        descriptionKu,
        cover_image,
        cover_image_size_bytes: newCoverImageBytes,
        start_date: utcStartDate,
        end_date: utcEndDate,
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

      // Delete cover image from R2 and decrement storage
      if (offer.cover_image) {
        await deleteFromR2(offer.cover_image);
        await decrementSellerStorage(
          sellerId,
          offer.cover_image_size_bytes || 0,
        );
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
