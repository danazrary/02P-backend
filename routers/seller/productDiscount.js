import { Router } from "express";
import Product from "../../database/products.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";

const router = Router();

// Get all products for discount management
router.get("/products-discount", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { filterType } = req.query; // 'discount', 'free_delivery', 'both', 'none'

    let whereClause = { seller_id: id };

    // Filter products based on type
    if (filterType === "discount") {
      whereClause.hasDiscount = true;
    } else if (filterType === "free_delivery") {
      whereClause.free_delivery = true;
    } else if (filterType === "both") {
      whereClause.hasDiscount = true;
      whereClause.free_delivery = true;
    } else if (filterType === "none_discount") {
      whereClause.hasDiscount = false;
    } else if (filterType === "none_free_delivery") {
      whereClause.free_delivery = false;
    } else if (filterType === "none_both") {
      whereClause[Op.or] = [{ hasDiscount: false }, { free_delivery: false }];
    }

    const products = await Product.findAll({
      where: whereClause,
      attributes: [
        "id",
        "language",
        "titleKu",
        "titleAr",
        "images",
        "realPrice",
        "priceType",
        "hasDiscount",
        "discountPrice",
        "discountType",
        "discountStartDate",
        "discountEndDate",
        "free_delivery",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      error: false,
      data: products,
    });
  } catch (error) {
    console.error("Error fetching products for discount:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to fetch products",
    });
  }
});

// Add discount or free delivery to products
router.put("/products-discount/add", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const {
      productIds,
      actionType, // 'discount', 'free_delivery', 'both'
      discountPrice,
      discountType, // 'permanent', 'timer'
      startDate,
      endDate,
      applyToAll,
    } = req.body;

    let whereClause = { seller_id: id };

    if (!applyToAll && productIds && productIds.length > 0) {
      whereClause.id = { [Op.in]: productIds };
    }

    let updateData = {};

    if (actionType === "discount" || actionType === "both") {
      updateData.hasDiscount = true;
      updateData.discountPrice = discountPrice;
      updateData.discountType = discountType || "timer";
      updateData.discountStartDate = startDate;
      updateData.discountEndDate = endDate;
    }

    if (actionType === "free_delivery" || actionType === "both") {
      updateData.free_delivery = true;
      updateData.discountStartDate = startDate;
      updateData.discountEndDate = endDate;
    }

    const [updatedCount] = await Product.update(updateData, {
      where: whereClause,
    });

    res.status(200).json({
      success: true,
      error: false,
      message: `Successfully updated ${updatedCount} product(s)`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error adding discount/free delivery:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Failed to update products",
    });
  }
});

// Remove discount or free delivery from products
router.put(
  "/products-discount/remove",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const { id } = req.user;
      const {
        productIds,
        actionType, // 'discount', 'free_delivery', 'both'
        applyToAll,
      } = req.body;

      let whereClause = { seller_id: id };

      if (!applyToAll && productIds && productIds.length > 0) {
        whereClause.id = { [Op.in]: productIds };
      }

      let updateData = {};

      if (actionType === "discount" || actionType === "both") {
        updateData.hasDiscount = false;
        updateData.discountPrice = null;
        updateData.discountType = null;
        updateData.discountStartDate = null;
        updateData.discountEndDate = null;
      }

      if (actionType === "free_delivery" || actionType === "both") {
        updateData.free_delivery = false;

        updateData.discountStartDate = null;
        updateData.discountEndDate = null;
      }
      const [updatedCount] = await Product.update(updateData, {
        where: whereClause,
      });

      res.status(200).json({
        success: true,
        error: false,
        message: `Successfully removed from ${updatedCount} product(s)`,
        updatedCount,
      });
    } catch (error) {
      console.error("Error removing discount/free delivery:", error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to update products",
      });
    }
  },
);

// Get products count by type
router.get(
  "/products-discount/counts",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const { id } = req.user;

      const totalProducts = await Product.count({ where: { seller_id: id } });
      const withDiscount = await Product.count({
        where: { seller_id: id, hasDiscount: true },
      });
      const withFreeDelivery = await Product.count({
        where: { seller_id: id, free_delivery: true },
      });
      const withBoth = await Product.count({
        where: {
          seller_id: id,
          hasDiscount: true,
          free_delivery: true,
        },
      });

      res.status(200).json({
        success: true,
        error: false,
        data: {
          total: totalProducts,
          withDiscount,
          withFreeDelivery,
          withBoth,
          withoutDiscount: totalProducts - withDiscount,
          withoutFreeDelivery: totalProducts - withFreeDelivery,
        },
      });
    } catch (error) {
      console.error("Error fetching product counts:", error);
      res.status(500).json({
        success: false,
        error: true,
        message: "Failed to fetch product counts",
      });
    }
  },
);

export default router;
