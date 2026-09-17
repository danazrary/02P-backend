import { Router } from "express";
import { Op } from "sequelize";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { decrementSellerStorage } from "../../middlewares/checkStorageLimit.js";
import { deleteMultipleFromR2 } from "../../utils/r2.js";
import {
  getProductImageRecordBytes,
  getStoredAssetBytes,
} from "../../utils/sellerStorageUsage.js";

const router = Router();

// GET /catalog/products
router.get("/catalog/products", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.seller_id;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const search = req.query.search?.trim() || "";
    const category = req.query.category?.trim() || "";

    const where = { seller_id: sellerId };
    if (category) where.category = category;
    if (search) {
      where[Op.or] = [
        { titleKu: { [Op.like]: `%${search}%` } },
        { titleAr: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discount_percent",
        "discountType",
        "free_delivery",
        "category",
        "subcategory",
        "language",
        "hasCashback",
        "cashbackType",
        "cashbackValue",
        "stock",
        "isAvailable",
        "options",
        "variants",
        "variantPrices",
        "variantPricesAr",
        "createdAt",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const data = rows.map((p) => {
      const mainImg =
        p.productImages?.find((img) => img.is_main) || p.productImages?.[0];
      return {
        id: p.id,
        titleKu: p.titleKu,
        titleAr: p.titleAr,
        realPrice: p.realPrice,
        priceType: p.priceType,
        hasDiscount: p.hasDiscount,
        discount_percent: p.discount_percent,
        free_delivery: p.free_delivery,
        category: p.category,
        subcategory: p.subcategory,
        language: p.language,
        options: p.options,
        variants: p.variants,
        variantPrices: p.variantPrices,
        variantPricesAr: p.variantPricesAr,
        stock: p.stock,
        isAvailable: p.isAvailable,
        thumb_key: mainImg?.thumb_key || mainImg?.image_key || null,
        productImages: p.productImages || [],
      };
    });

    return res.status(200).json({
      success: true,
      error: false,
      products: data,
      total: count,
      hasMore: offset + data.length < count,
    });
  } catch (error) {
    console.error("Error fetching catalog products:", error);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

// PUT /catalog/bulk-category
router.put("/catalog/bulk-category", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.seller_id;
    const { productIds, category, subcategory } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "productIds must be a non-empty array",
      });
    }

    const catValue =
      category && typeof category === "string" ? category.trim() || null : null;
    const subValue =
      subcategory && typeof subcategory === "string"
        ? subcategory.trim() || null
        : null;

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

// DELETE /catalog/bulk-delete
router.delete(
  "/catalog/bulk-delete",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const sellerId = req.user?.id || req.user?.seller_id;
      const userType = req.user?.userType || req.user?.role;

      if (
        req.user?.userType === "staff" &&
        userType !== "manager" &&
        userType !== "owner"
      ) {
        return res.status(403).json({
          success: false,
          error: true,
          message: "تەنها خاوەنی فرۆشگا دەتوانێت بەرهەمەکان بسڕێتەوە.",
        });
      }

      const { productIds } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "productIds must be a non-empty array",
        });
      }

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
      const imageRecords = await ProductImage.findAll({
        where: { product_id: { [Op.in]: foundIds } },
      });

      const r2Keys = [];
      let totalBytes = 0;
      for (const rec of imageRecords) {
        if (rec.image_key) r2Keys.push(rec.image_key);
        if (rec.thumb_key) r2Keys.push(rec.thumb_key);
        totalBytes += await getProductImageRecordBytes(rec);
      }

      let colorBytes = 0;
      for (const product of products) {
        const colorImages = (product.colors || []).filter(
          (c) => c && c.imageKey,
        );
        for (const ci of colorImages) {
          r2Keys.push(ci.imageKey);
          colorBytes +=
            Number(ci.imageSizeBytes || 0) ||
            (ci.imageKey ? await getStoredAssetBytes(ci.imageKey) : 0);
        }
      }

      if (r2Keys.length > 0) {
        await deleteMultipleFromR2(r2Keys);
      }

      if (imageRecords.length > 0) {
        await ProductImage.destroy({
          where: { product_id: { [Op.in]: foundIds } },
        });
      }

      const storageBytes = totalBytes + colorBytes;
      if (storageBytes > 0) {
        await decrementSellerStorage(sellerId, storageBytes);
      }

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
