import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";
import Report from "../../database/report.js";
import SellerOffer from "../../database/sellerOffer.js";
const router = Router();

// Multer setup to save images in /uploads folder

// Route to create product
router.get("/product/:id", detectSeller, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Product not found",
      });
    }

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
