import { Router } from "express";
import Product from "../../database/products.js";
import ProductImage from "../../database/productImages.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { Op } from "sequelize";
import { checkAndCleanProductExpiration } from "../../utils/checkProductExpiration.js";
import { toUTC } from "../../utils/timezoneHandler.js";
import { parseOptionalCashbackDate } from "../../utils/cashbackDates.js";

const router = Router();

function parseBooleanInput(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function parseOptionalDecimal(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be a valid number.`;
    throw err;
  }
  return parsed;
}

function parseOptionalDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be a valid date.`;
    throw err;
  }
  return parsed;
}

function normalizeProductIds(productIds) {
  if (!Array.isArray(productIds)) return [];
  return [...new Set(productIds.map((id) => Number(id)).filter(Number.isInteger))];
}

function normalizeCashbackBulkPayload(body = {}) {
  const hasCashback = parseBooleanInput(body.hasCashback);

  if (!hasCashback) {
    return {
      hasCashback: false,
      cashbackType: "percentage",
      cashbackValue: null,
      cashbackStartDate: null,
      cashbackEndDate: null,
      cashbackMinOrderAmount: null,
    };
  }

  const cashbackType = body.cashbackType || "percentage";
  if (!["percentage", "fixed"].includes(cashbackType)) {
    const err = new Error("Invalid cashbackType");
    err.statusCode = 400;
    err.clientMessage = "cashbackType must be percentage or fixed.";
    throw err;
  }

  const cashbackValue = parseOptionalDecimal(body.cashbackValue, "cashbackValue");
  if (cashbackValue === null) {
    const err = new Error("Missing cashbackValue");
    err.statusCode = 400;
    err.clientMessage = "cashbackValue is required when cashback is enabled.";
    throw err;
  }
  if (cashbackType === "percentage" && (cashbackValue <= 0 || cashbackValue > 100)) {
    const err = new Error("Invalid cashback percentage");
    err.statusCode = 400;
    err.clientMessage = "Percentage cashback must be greater than 0 and no more than 100.";
    throw err;
  }
  if (cashbackType === "fixed" && cashbackValue <= 0) {
    const err = new Error("Invalid fixed cashback");
    err.statusCode = 400;
    err.clientMessage = "Fixed cashback must be greater than 0.";
    throw err;
  }

  const cashbackStartDate = parseOptionalCashbackDate(body.cashbackStartDate, "cashbackStartDate");
  const cashbackEndDate = parseOptionalCashbackDate(body.cashbackEndDate, "cashbackEndDate");
  if (cashbackStartDate && cashbackEndDate && cashbackEndDate <= cashbackStartDate) {
    const err = new Error("Invalid cashback date range");
    err.statusCode = 400;
    err.clientMessage = "cashbackEndDate must be after cashbackStartDate.";
    throw err;
  }

  const cashbackMinOrderAmount = parseOptionalDecimal(
    body.cashbackMinOrderAmount,
    "cashbackMinOrderAmount",
  );
  if (cashbackMinOrderAmount !== null && cashbackMinOrderAmount < 0) {
    const err = new Error("Invalid cashbackMinOrderAmount");
    err.statusCode = 400;
    err.clientMessage = "cashbackMinOrderAmount must be zero or greater.";
    throw err;
  }

  return {
    hasCashback: true,
    cashbackType,
    cashbackValue,
    cashbackStartDate,
    cashbackEndDate,
    cashbackMinOrderAmount,
  };
}

// Get all products for discount management
router.get("/products-discount", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id } = req.user;
    const { filterType } = req.query; // discount, free_delivery, cashback, both, none_*
    const limit = Math.min(parseInt(req.query.limit) || 15, 100);
    const offset = parseInt(req.query.offset) || 0;

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
    } else if (filterType === "cashback") {
      whereClause.hasCashback = true;
    } else if (filterType === "none_cashback") {
      whereClause.hasCashback = false;
    }

    const { count: total, rows: rawProducts } = await Product.findAndCountAll({
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
        "discount_percent",
        "discountType",
        "discountStartDate",
        "discountEndDate",
        "freeDeliveryStartDate",
        "freeDeliveryEndDate",
        "free_delivery",
        "hasCashback",
        "cashbackType",
        "cashbackValue",
        "cashbackStartDate",
        "cashbackEndDate",
        "cashbackMinOrderAmount",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["image_key", "thumb_key", "is_main"],
          required: false,
        },
      ],
      limit,
      offset,
      order: [["id", "DESC"]],
      distinct: true,
    });

    // Check and clean expired discounts and free delivery
    const products = await checkAndCleanProductExpiration(rawProducts);

    res.status(200).json({
      success: true,
      error: false,
      data: products,
      total,
      hasMore: offset + limit < total,
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
      discount_percent,
      discountType, // 'permanent', 'timer'
      startDate,
      endDate,
      applyToAll,
    } = req.body;

    let whereClause = { seller_id: id };

    if (!applyToAll && productIds && productIds.length > 0) {
      whereClause.id = { [Op.in]: productIds };
    }

    const utcStartDate = toUTC(startDate);
    const utcEndDate = toUTC(endDate);

    let updateData = {};

    if (actionType === "discount" || actionType === "both") {
      updateData.hasDiscount = true;
      updateData.discount_percent = discount_percent;
      updateData.discountType = discountType || "timer";
      updateData.discountStartDate = utcStartDate;
      updateData.discountEndDate = utcEndDate;
    }

    if (actionType === "free_delivery" || actionType === "both") {
      updateData.free_delivery = true;
      updateData.freeDeliveryStartDate = utcStartDate;
      updateData.freeDeliveryEndDate = utcEndDate;
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
        updateData.discount_percent = null;
        updateData.discountType = null;
        updateData.discountStartDate = null;
        updateData.discountEndDate = null;
      }

      if (actionType === "free_delivery" || actionType === "both") {
        updateData.free_delivery = false;
        updateData.freeDeliveryStartDate = null;
        updateData.freeDeliveryEndDate = null;
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


router.put("/products-discount/cashback", jwtVerifySellerToken, async (req, res) => {
  const transaction = await Product.sequelize.transaction();
  try {
    const { id: sellerId } = req.user;
    const productIds = normalizeProductIds(req.body.productIds);

    if (productIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: true,
        message: "productIds array is required.",
      });
    }

    const updateData = normalizeCashbackBulkPayload(req.body);
    const ownedProducts = await Product.findAll({
      where: { id: { [Op.in]: productIds }, seller_id: sellerId },
      attributes: ["id"],
      transaction,
    });

    if (ownedProducts.length !== productIds.length) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        error: true,
        message: "One or more selected products do not belong to this seller.",
      });
    }

    const [updatedCount] = await Product.update(updateData, {
      where: { id: { [Op.in]: productIds }, seller_id: sellerId },
      transaction,
    });

    const updatedProducts = await Product.findAll({
      where: { id: { [Op.in]: productIds }, seller_id: sellerId },
      attributes: [
        "id",
        "hasCashback",
        "cashbackType",
        "cashbackValue",
        "cashbackStartDate",
        "cashbackEndDate",
        "cashbackMinOrderAmount",
      ],
      transaction,
    });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      error: false,
      message: `Successfully updated cashback for ${updatedCount} product(s)`,
      updatedCount,
      products: updatedProducts,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating cashback:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: true,
      message: error.clientMessage || "Failed to update cashback.",
    });
  }
});
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
      const withCashback = await Product.count({
        where: { seller_id: id, hasCashback: true },
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
          withCashback,
          withoutCashback: totalProducts - withCashback,
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





