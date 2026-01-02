import express from "express";
import multer from "multer";
import path from "path";
import SellerOffer from "../../database/sellerOffer.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import fs from "fs";
import Product from "../../database/products.js";

const router = express.Router();

// Multer setup to save images in /uploads/offers folder
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/offers"); // folder must exist
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const deleteFileIfExists = (filePath) => {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// Route to create offer
router.post(
  "/add-offer",
  jwtVerifySellerToken,
  upload.single("coverImage"),
  async (req, res) => {
    try {
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
      } = req.body;
      console.log("data", req.body, "data end");

      const { id } = req.user;

      // Save uploaded cover image path
      const cover_image = req.file
        ? `/uploads/offers/${req.file.filename}`
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
  }
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
      } = req.body;

      // Delete old cover image if new one is uploaded
      if (req.file && offer.cover_image) {
        deleteFileIfExists(offer.cover_image);
      }

      const cover_image = req.file
        ? `/uploads/offers/${req.file.filename}`
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
  }
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
        deleteFileIfExists(offer.cover_image);
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
  }
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
        })
      );
    }
    if (offer.get_product_id_quantity) {
      getGetProductsDetails = await Promise.all(
        offer.get_product_id_quantity.map(async (item) => {
          const product = await Product.findByPk(item.id);
          return { ...item, product };
        })
      );
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
