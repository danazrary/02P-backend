import { Router } from "express";
import { detectSeller } from "../../middlewares/jwtVerify.js";
import Product from "../../database/products.js";

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

    res.status(200).json({
      success: true,
      error: false,
      product,
      isSeller: req.isSeller, // 👈 MAGIC HERE
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
