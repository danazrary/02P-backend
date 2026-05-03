import { Router } from "express";
import { Op } from "sequelize";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { decrementSellerStorage } from "../../middlewares/checkStorageLimit.js";
import { deleteMultipleFromR2 } from "../../utils/r2.js";

const router = Router();

/**
 * GET /catalog/products
 * Returns a lightweight list of all seller products for catalog management.
 * Includes: id, title (ku/ar), realPrice, priceType, category, subcategory, thumbnail
 */
router.get("/catalog/products", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;

    const products = await Product.findAll({
      where: { seller_id: sellerId },
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "realPrice",
        "priceType",
        "category",
        "subcategory",
        "language",
        "createdAt",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
          where: { is_main: true },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const data = products.map((p) => {
      const mainImg = p.productImages?.[0];
      return {
        id: p.id,
        titleKu: p.titleKu,
        titleAr: p.titleAr,
        realPrice: p.realPrice,
        priceType: p.priceType,
        category: p.category,
        subcategory: p.subcategory,
        language: p.language,
        thumb_key: mainImg?.thumb_key || mainImg?.image_key || null,
      };
    });

    return res
      .status(200)
      .json({ success: true, error: false, products: data });
  } catch (error) {
    console.error("Error fetching catalog products:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

/**
 * PUT /catalog/bulk-category
 * Bulk update category (and optional subcategory) for multiple products.
 * Body: { productIds: number[], category: string, subcategory?: string }
 */
router.put("/catalog/bulk-category", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { productIds, category, subcategory } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "productIds must be a non-empty array",
      });
    }

    if (productIds.length > 200) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Too many products selected (max 200)",
      });
    }

    // category can be null/empty string to clear it
    const catValue =
      category && typeof category === "string" ? category.trim() || null : null;
    const subValue =
      subcategory && typeof subcategory === "string"
        ? subcategory.trim() || null
        : null;

    // Only update products belonging to this seller
    const [updatedCount] = await Product.update(
      { category: catValue, subcategory: subValue },
      {
        where: {
          id: { [Op.in]: productIds },
          seller_id: sellerId,
        },
      },
    );

    return res.status(200).json({
      success: true,
      error: false,
      updatedCount,
      message: `Updated ${updatedCount} product(s)`,
    });
  } catch (error) {
    console.error("Error bulk updating category:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

/**
 * DELETE /catalog/bulk-delete
 * Bulk delete multiple products including R2 images and storage decrement.
 * Body: { productIds: number[] }
 */
router.delete(
  "/catalog/bulk-delete",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { productIds } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "productIds must be a non-empty array",
        });
      }

      if (productIds.length > 50) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Too many products selected at once (max 50)",
        });
      }

      // Verify all belong to this seller
      const products = await Product.findAll({
        where: { id: { [Op.in]: productIds }, seller_id: sellerId },
      });

      if (products.length === 0) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "No matching products found",
        });
      }

      const foundIds = products.map((p) => p.id);

      // Gather all R2 image records
      const imageRecords = await ProductImage.findAll({
        where: { product_id: { [Op.in]: foundIds } },
      });

      // Collect R2 keys and total bytes for storage decrement
      const r2Keys = [];
      let totalBytes = 0;
      for (const rec of imageRecords) {
        if (rec.image_key) r2Keys.push(rec.image_key);
        if (rec.thumb_key) r2Keys.push(rec.thumb_key);
        totalBytes += rec.size_bytes || 0;
      }

      // Collect color image keys from product.colors
      let colorBytes = 0;
      for (const product of products) {
        const colorImages = (product.colors || []).filter((c) => c.imageKey);
        for (const ci of colorImages) {
          r2Keys.push(ci.imageKey);
          colorBytes += ci.imageSizeBytes || 0;
        }
      }

      // Delete from R2
      if (r2Keys.length > 0) {
        await deleteMultipleFromR2(r2Keys);
      }

      // Delete image records
      if (imageRecords.length > 0) {
        await ProductImage.destroy({
          where: { product_id: { [Op.in]: foundIds } },
        });
      }

      // Decrement storage
      const storageBytes = totalBytes + colorBytes;
      if (storageBytes > 0) {
        await decrementSellerStorage(sellerId, storageBytes);
      }

      // Delete products
      await Product.destroy({
        where: { id: { [Op.in]: foundIds }, seller_id: sellerId },
      });

      return res.status(200).json({
        success: true,
        error: false,
        deletedCount: foundIds.length,
        message: `Deleted ${foundIds.length} product(s)`,
      });
    } catch (error) {
      console.error("Error bulk deleting products:", error);
      return res
        .status(500)
        .json({ success: false, error: true, message: "Server error" });
    }
  },
);

export default router;
