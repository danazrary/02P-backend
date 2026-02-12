import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import Report from "../../database/report.js";
import SellerOffer from "../../database/sellerOffer.js";
import { Op } from "sequelize";
import {
  checkAndCleanProductExpiration,
  checkAndCleanSingleProduct,
} from "../../utils/checkProductExpiration.js";
const router = Router();

// Get cart products with full data by IDs
router.post("/cart-products", async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "productIds array is required",
      });
    }

    // Limit to 50 products max
    const limitedIds = productIds.slice(0, 50);

    // Get full product data
    let products = await Product.findAll({
      where: { id: { [Op.in]: limitedIds } },
    });

    // Check and clean expired discounts and free delivery
    products = await checkAndCleanProductExpiration(products);

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        error: false,
        products: [],
        offers: [],
        seller: null,
      });
    }

    // Get seller ID from first product
    const sellerId = products[0].seller_id;

    // Get all active offers for this seller
    const currentDate = new Date();
    const offers = await SellerOffer.findAll({
      where: {
        seller_id: sellerId,
        is_active: true,
        start_date: { [Op.lte]: currentDate },
        end_date: { [Op.gte]: currentDate },
      },
    });

    // Get seller info (phone for WhatsApp)
    const { default: Seller } = await import("../../database/seller.js");
    const seller = await Seller.findByPk(sellerId, {
      attributes: [
        "id",
        "name",
        "shop_name",
        "shop_image",
        "phone",
        "brand_color",
      ],
    });

    res.status(200).json({
      success: true,
      error: false,
      products,
      offers,
      seller,
    });
  } catch (error) {
    console.error("Cart products error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch cart products",
    });
  }
});

// Multer setup to save images in /uploads folder

// Route to create product
router.get("/product/:id", detectSeller, async (req, res) => {
  try {
    const { id } = req.params;

    let product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Product not found",
      });
    }

    // Check and clean expired discounts and free delivery
    product = await checkAndCleanSingleProduct(product);

    // 👀 increase product views
    await product.increment("views", { by: 1 });

    // 📊 REPORT LOGIC
    const today = new Date().toISOString().split("T")[0];

    const [report, created] = await Report.findOrCreate({
      where: {
        seller_id: product.seller_id,
        report_date: today,
      },
      defaults: {
        productViews: 1,
      },
    });

    // if report already exists → increment
    if (!created) {
      await report.increment("productViews", { by: 1 });
    }

    res.status(200).json({
      success: true,
      error: false,
      product,
      isSeller: req.isSeller,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch product",
    });
  }
});

export default router;
