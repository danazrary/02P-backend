import { Router } from "express";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import Seller from "../../database/seller.js";
import Product from "../../database/products.js";

const router = Router();

/**
 * GET /categories - Get seller's categories
 */
router.get("/categories", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const seller = await Seller.findByPk(id, {
      attributes: ["categories"],
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    return res.status(200).json({
      success: true,
      error: false,
      categories: seller.categories || [],
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

/**
 * POST /categories - Add a new category
 */
router.post("/categories", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { category } = req.body;

    if (!category || typeof category !== "string" || !category.trim()) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Category name is required",
      });
    }

    const trimmedCategory = category.trim();

    const seller = await Seller.findByPk(id);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    const currentCategories = seller.categories || [];

    // Check if category already exists (case-insensitive)
    if (
      currentCategories.some(
        (c) => c.toLowerCase() === trimmedCategory.toLowerCase(),
      )
    ) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Category already exists",
      });
    }

    const updatedCategories = [...currentCategories, trimmedCategory];
    await seller.update({ categories: updatedCategories });

    return res.status(201).json({
      success: true,
      error: false,
      categories: updatedCategories,
      message: "Category added successfully",
    });
  } catch (error) {
    console.error("Error adding category:", error);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

/**
 * DELETE /categories/:categoryName - Remove a category
 * Only if no products are using it
 */
router.delete(
  "/categories/:categoryName",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const { id } = req.user;
      const { categoryName } = req.params;

      const decodedCategory = decodeURIComponent(categoryName);

      const seller = await Seller.findByPk(id);
      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      const currentCategories = seller.categories || [];

      // Check if category exists
      const categoryIndex = currentCategories.findIndex(
        (c) => c.toLowerCase() === decodedCategory.toLowerCase(),
      );

      if (categoryIndex === -1) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Category not found",
        });
      }

      // Check if any products use this category
      const productsUsingCategory = await Product.count({
        where: {
          seller_id: id,
          category: currentCategories[categoryIndex],
        },
      });

      if (productsUsingCategory > 0) {
        return res.status(400).json({
          success: false,
          error: true,
          message:
            "Cannot delete category. There are products using this category.",
          productsCount: productsUsingCategory,
        });
      }

      const updatedCategories = currentCategories.filter(
        (_, i) => i !== categoryIndex,
      );
      await seller.update({ categories: updatedCategories });

      return res.status(200).json({
        success: true,
        error: false,
        categories: updatedCategories,
        message: "Category deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting category:", error);
      return res.status(500).json({
        success: false,
        error: true,
        message: "Server error",
      });
    }
  },
);

export default router;
