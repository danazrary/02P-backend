import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { r2Multer, uploadToR2, deleteFromR2 } from "../../utils/r2.js";
import Seller from "../../database/seller.js";
import Product from "../../database/products.js";

const catImageUpload = r2Multer.single("image");

const router = Router();

/**
 * GET /categories - Get seller's categories (flat list, backward-compat)
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
 * GET /categories-full - Get categories + subcategories_map together
 */
router.get("/categories-full", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const seller = await Seller.findByPk(id, {
      attributes: ["categories", "subcategories_map", "category_images"],
    });

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    return res.status(200).json({
      success: true,
      error: false,
      categories: seller.categories || [],
      subcategories_map: seller.subcategories_map || {},
      category_images: seller.category_images || {},
    });
  } catch (error) {
    console.error("Error fetching categories-full:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
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
 * PUT /categories/:categoryName - Rename a category (also updates all products using it)
 */
router.put(
  "/categories/:categoryName",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const { id } = req.user;
      const { categoryName } = req.params;
      const { newName } = req.body;

      if (!newName || typeof newName !== "string" || !newName.trim()) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "New category name is required",
        });
      }

      const decodedCategory = decodeURIComponent(categoryName);
      const trimmedNew = newName.trim();

      const seller = await Seller.findByPk(id);
      if (!seller) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Seller not found" });
      }

      const currentCategories = seller.categories || [];
      const idx = currentCategories.findIndex(
        (c) => c.toLowerCase() === decodedCategory.toLowerCase(),
      );

      if (idx === -1) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Category not found" });
      }

      // Check new name doesn't already exist
      if (
        currentCategories.some(
          (c, i) => i !== idx && c.toLowerCase() === trimmedNew.toLowerCase(),
        )
      ) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "A category with that name already exists",
        });
      }

      const oldName = currentCategories[idx];
      const updatedCategories = [...currentCategories];
      updatedCategories[idx] = trimmedNew;

      // Also update subcategories_map key if it existed
      const subsMap = { ...(seller.subcategories_map || {}) };
      if (subsMap[oldName]) {
        subsMap[trimmedNew] = subsMap[oldName];
        delete subsMap[oldName];
      }

      // Also update category_images map key if it existed
      const catImages = { ...(seller.category_images || {}) };
      if (catImages[oldName] !== undefined) {
        catImages[trimmedNew] = catImages[oldName];
        delete catImages[oldName];
      }

      await seller.update({
        categories: updatedCategories,
        subcategories_map: subsMap,
        category_images: catImages,
      });

      // Update all products that had this category
      await Product.update(
        { category: trimmedNew },
        { where: { seller_id: id, category: oldName } },
      );

      return res.status(200).json({
        success: true,
        error: false,
        categories: updatedCategories,
        subcategories_map: subsMap,
        category_images: catImages,
        message: "Category renamed successfully",
      });
    } catch (error) {
      console.error("Error renaming category:", error);
      return res
        .status(500)
        .json({ success: false, error: true, message: "Server error" });
    }
  },
);

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

      const categoryName_ = currentCategories[categoryIndex];
      const updatedCategories = currentCategories.filter(
        (_, i) => i !== categoryIndex,
      );

      // Remove from subcategories_map too
      const subsMap = { ...(seller.subcategories_map || {}) };
      delete subsMap[categoryName_];

      // Delete category image from R2 if exists
      const catImages = { ...(seller.category_images || {}) };
      if (catImages[categoryName_]) {
        await deleteFromR2(catImages[categoryName_]).catch(() => {});
        delete catImages[categoryName_];
      }

      await seller.update({
        categories: updatedCategories,
        subcategories_map: subsMap,
        category_images: catImages,
      });

      return res.status(200).json({
        success: true,
        error: false,
        categories: updatedCategories,
        subcategories_map: subsMap,
        category_images: catImages,
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

/**
 * POST /subcategories - Add a subcategory under an existing category
 * Body: { category: string, subcategory: string }
 */
router.post("/subcategories", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { category, subcategory } = req.body;

    if (
      !category ||
      !subcategory ||
      typeof category !== "string" ||
      typeof subcategory !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "category and subcategory are required",
      });
    }

    const trimmedCat = category.trim();
    const trimmedSub = subcategory.trim();

    if (!trimmedCat || !trimmedSub) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "category and subcategory cannot be empty",
      });
    }

    const seller = await Seller.findByPk(id, {
      attributes: ["id", "categories", "subcategories_map"],
    });
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    const currentCategories = seller.categories || [];
    if (!currentCategories.includes(trimmedCat)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Parent category not found",
      });
    }

    const subsMap = { ...(seller.subcategories_map || {}) };
    const currentSubs = subsMap[trimmedCat] || [];

    if (currentSubs.some((s) => s.toLowerCase() === trimmedSub.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Subcategory already exists",
      });
    }

    subsMap[trimmedCat] = [...currentSubs, trimmedSub];
    await seller.update({ subcategories_map: subsMap });

    return res.status(201).json({
      success: true,
      error: false,
      subcategories_map: subsMap,
      message: "Subcategory added successfully",
    });
  } catch (error) {
    console.error("Error adding subcategory:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

/**
 * DELETE /subcategories - Remove a subcategory
 * Body: { category: string, subcategory: string }
 */
router.delete("/subcategories", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { category, subcategory } = req.body;

    if (!category || !subcategory) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "category and subcategory are required",
      });
    }

    const trimmedCat = category.trim();
    const trimmedSub = subcategory.trim();

    const seller = await Seller.findByPk(id, {
      attributes: ["id", "subcategories_map"],
    });
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    const subsMap = { ...(seller.subcategories_map || {}) };
    const currentSubs = subsMap[trimmedCat] || [];
    const idx = currentSubs.findIndex(
      (s) => s.toLowerCase() === trimmedSub.toLowerCase(),
    );

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Subcategory not found",
      });
    }

    subsMap[trimmedCat] = currentSubs.filter((_, i) => i !== idx);
    if (subsMap[trimmedCat].length === 0) delete subsMap[trimmedCat];

    await seller.update({ subcategories_map: subsMap });

    return res.status(200).json({
      success: true,
      error: false,
      subcategories_map: subsMap,
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

/**
 * PUT /categories/:categoryName/image - Upload or replace a category image
 */
router.put(
  "/categories/:categoryName/image",
  jwtVerifySellerToken,
  (req, res, next) => {
    catImageUpload(req, res, (err) => {
      if (err)
        return res
          .status(400)
          .json({ success: false, error: true, message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { id } = req.user;
      const decodedCategory = decodeURIComponent(req.params.categoryName);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "No image file provided",
        });
      }

      const seller = await Seller.findByPk(id, {
        attributes: ["id", "categories", "category_images"],
      });
      if (!seller) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Seller not found" });
      }

      const currentCategories = seller.categories || [];
      if (!currentCategories.includes(decodedCategory)) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Category not found" });
      }

      const catImages = { ...(seller.category_images || {}) };

      // Delete old image from R2 if exists
      if (catImages[decodedCategory]) {
        await deleteFromR2(catImages[decodedCategory]).catch(() => {});
      }

      // Upload new image to R2
      const catKey = `shops/${id}/categories/${uuidv4()}.webp`;
      await uploadToR2(req.file.buffer, catKey);
      catImages[decodedCategory] = catKey;

      await seller.update({ category_images: catImages });

      return res.status(200).json({
        success: true,
        error: false,
        category_images: catImages,
        message: "Category image updated",
      });
    } catch (error) {
      console.error("Error uploading category image:", error);
      return res.status(500).json({
        success: false,
        error: true,
        message: error.message || "Server error",
      });
    }
  },
);

/**
 * DELETE /categories/:categoryName/image - Remove a category image
 */
router.delete(
  "/categories/:categoryName/image",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const { id } = req.user;
      const decodedCategory = decodeURIComponent(req.params.categoryName);

      const seller = await Seller.findByPk(id, {
        attributes: ["id", "category_images"],
      });
      if (!seller) {
        return res
          .status(404)
          .json({ success: false, error: true, message: "Seller not found" });
      }

      const catImages = { ...(seller.category_images || {}) };
      if (catImages[decodedCategory]) {
        await deleteFromR2(catImages[decodedCategory]).catch(() => {});
        delete catImages[decodedCategory];
        await seller.update({ category_images: catImages });
      }

      return res.status(200).json({
        success: true,
        error: false,
        category_images: catImages,
        message: "Category image removed",
      });
    } catch (error) {
      console.error("Error deleting category image:", error);
      return res
        .status(500)
        .json({ success: false, error: true, message: "Server error" });
    }
  },
);

export default router;
