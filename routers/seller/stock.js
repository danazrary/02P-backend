// backend/routes/seller/stock.js
import { Router } from "express";
import { Op } from "sequelize";
import sequelize from "../../database/sequelize.js";
import Product from "../../database/products.js";
import Order from "../../database/order.js";
import OrderItem from "../../database/orderItem.js";
import ProductImage from "../../database/productImages.js";
import { requirePermission } from "../../middlewares/staffPermissions.js";
import { applyItemStockIncrement } from "../../utils/productStock.js";

const router = Router();

// Only owner ("seller") and staff with "admin" role have both permissions
const stockAccessGuard = requirePermission("editProduct", "viewOrders");

const MAX_STOCK = 9999999;
const DEFAULT_SORT = "stock_desc";
const ALLOWED_SORTS = ["stock_desc", "stock_asc", "pending_desc"];
const PAGE_SIZE = 15;

// Keys inside a variantPrices row that are NOT option values (color, size, ...).
// Everything else that holds a string/number is treated as an option.
const VARIANT_NON_OPTION_KEYS = new Set([
  "price",
  "stock",
  "image",
  "images",
  "sku",
  "id",
  "barcode",
]);

/* ────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────── */

// JSON columns can arrive as arrays or as JSON strings depending on the driver.
function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Reads a stored stock value. Returns null when stock is not registered.
function toStockNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.floor(num));
}

// Validates a stock value coming from the client. Returns null when invalid.
function parseStockInput(raw) {
  if (
    raw === null ||
    raw === undefined ||
    raw === "" ||
    typeof raw === "boolean"
  ) {
    return null;
  }
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(num) || num < 0 || num > MAX_STOCK) return null;
  return num;
}

function extractVariantOptions(row) {
  if (!row || typeof row !== "object") return [];
  return Object.entries(row)
    .filter(
      ([key, value]) =>
        !VARIANT_NON_OPTION_KEYS.has(key) &&
        (typeof value === "string" || typeof value === "number") &&
        String(value).trim() !== "",
    )
    .map(([name, value]) => ({ name, value: String(value) }));
}

/**
 * Builds every stock-related field the client needs from a plain product.
 *
 * - Simple product: stock lives in `products.stock`.
 * - Product with variants: stock lives inside each `variantPrices` row, and
 *   `products.stock` is normally null. `variantPricesAr` is a parallel array
 *   (same index) that carries the Arabic option labels.
 */
function buildStockFields(plain) {
  const kuRows = parseJsonArray(plain.variantPrices);
  const arRows = parseJsonArray(plain.variantPricesAr);
  const variantCount = Math.max(kuRows.length, arRows.length);

  if (variantCount === 0) {
    const stock = toStockNumber(plain.stock);
    return {
      stock,
      hasVariants: false,
      variants: [],
      variantsWithoutStock: 0,
      totalStock: stock,
      stockRegistered: stock !== null,
    };
  }

  let totalStock = 0;
  let registeredCount = 0;

  const variants = Array.from({ length: variantCount }, (_, index) => {
    const ku =
      kuRows[index] && typeof kuRows[index] === "object" ? kuRows[index] : null;
    const ar =
      arRows[index] && typeof arRows[index] === "object" ? arRows[index] : null;

    const stock = toStockNumber(ku?.stock ?? ar?.stock);
    if (stock !== null) {
      totalStock += stock;
      registeredCount += 1;
    }

    const rawPrice = ku?.price ?? ar?.price;
    const price =
      rawPrice === null || rawPrice === undefined || rawPrice === ""
        ? null
        : Number(rawPrice);

    return {
      index,
      price: Number.isFinite(price) ? price : null,
      stock,
      optionsKu: extractVariantOptions(ku),
      optionsAr: extractVariantOptions(ar),
    };
  });

  return {
    stock: toStockNumber(plain.stock),
    hasVariants: true,
    variants,
    variantsWithoutStock: variantCount - registeredCount,
    totalStock: registeredCount > 0 ? totalStock : null,
    stockRegistered: registeredCount > 0,
  };
}

// Products with registered stock always come first; the rest go to the end.
function buildComparator(sortBy) {
  return (a, b) => {
    if (a.stockRegistered !== b.stockRegistered) {
      return a.stockRegistered ? -1 : 1;
    }

    const aStock = a.totalStock ?? 0;
    const bStock = b.totalStock ?? 0;

    let diff;
    if (sortBy === "stock_asc") diff = aStock - bStock;
    else if (sortBy === "stock_desc") diff = bStock - aStock;
    else diff = b.pendingCount - a.pendingCount;
    if (diff !== 0) return diff;

    return b.pendingCount - a.pendingCount || Number(a.id) - Number(b.id);
  };
}

function isMissingOrderItemOptionalColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    (message.includes("variant_options_snapshot") ||
      message.includes("selected_options")) &&
    (message.includes("unknown column") ||
      message.includes("doesn't exist") ||
      message.includes("no such column"))
  );
}

function getMissingOptionalColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  const missing = {
    variant_options_snapshot: message.includes("variant_options_snapshot"),
    selected_options: message.includes("selected_options"),
  };
  if (!missing.variant_options_snapshot && !missing.selected_options) {
    return { variant_options_snapshot: true, selected_options: true };
  }
  return missing;
}

/* ────────────────────────────────────────────────
   ROUTES
──────────────────────────────────────────────── */

// 1) GET / — Paginated products with stock (simple + variants) and order counts
//    Query: page (1-based), search, sortBy. Always returns at most PAGE_SIZE
//    products. Sorting is done on a light query first (ids + stock fields
//    only) so the order is correct across pages; the heavy data (images,
//    order stats) is then loaded for the current page only.
router.get("/", stockAccessGuard, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const { search } = req.query;
    const sortBy = ALLOWED_SORTS.includes(req.query.sortBy)
      ? req.query.sortBy
      : DEFAULT_SORT;
    const requestedPage = Number.parseInt(req.query.page, 10);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const whereClause = { seller_id: sellerId };

    if (typeof search === "string" && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { titleKu: { [Op.like]: term } },
        { titleAr: { [Op.like]: term } },
      ];
    }

    // Optional: fetch specific products by id (e.g. "1,2,3"). Used by the
    // client to refresh one row after accept / cancel without reloading
    // every page. Capped at PAGE_SIZE ids.
    if (typeof req.query.ids === "string" && req.query.ids.trim()) {
      const ids = req.query.ids
        .split(",")
        .map((v) => Number.parseInt(v, 10))
        .filter((v) => Number.isInteger(v) && v > 0)
        .slice(0, PAGE_SIZE);
      if (ids.length) {
        whereClause.id = { [Op.in]: ids };
      }
    }

    // Step 1: light query — only what is needed to sort.
    const lightProducts = await Product.findAll({
      where: whereClause,
      attributes: ["id", "stock", "variantPrices", "variantPricesAr"],
      raw: true,
    });

    const total = lightProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (total === 0) {
      return res.json({
        success: true,
        products: [],
        pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
      });
    }

    // Pending counts for ALL of the seller's products, needed only when
    // sorting by pending orders (and as the tie-breaker of every sort).
    const allIds = lightProducts.map((p) => p.id);
    const pendingRows = await OrderItem.findAll({
      where: { product_id: { [Op.in]: allIds } },
      attributes: [
        "product_id",
        [sequelize.fn("SUM", sequelize.col("quantity")), "total_qty"],
      ],
      include: [
        {
          model: Order,
          as: "order",
          where: { seller_id: sellerId, status: "pending" },
          attributes: [],
        },
      ],
      group: ["product_id"],
      raw: true,
    });
    const pendingMap = new Map(
      pendingRows.map((r) => [Number(r.product_id), Number(r.total_qty) || 0]),
    );

    const sortable = lightProducts.map((p) => ({
      id: p.id,
      pendingCount: pendingMap.get(Number(p.id)) || 0,
      ...buildStockFields(p),
    }));
    sortable.sort(buildComparator(sortBy));

    // Step 2: slice the requested page. A page past the end is clamped so
    // the client never receives an empty page for a non-empty list.
    const safePage = Math.min(page, totalPages);
    const pageIds = sortable
      .slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      .map((p) => p.id);

    // Step 3: heavy query for this page only.
    const products = await Product.findAll({
      where: { id: { [Op.in]: pageIds }, seller_id: sellerId },
      attributes: [
        "id",
        "titleKu",
        "titleAr",
        "images",
        "stock",
        "isAvailable",
        "priceType",
        "variantPrices",
        "variantPricesAr",
      ],
      include: [
        {
          model: ProductImage,
          as: "productImages",
          attributes: ["id", "image_key", "thumb_key", "is_main"],
        },
      ],
    });

    // Order item quantities by status, for this page only.
    const itemStats = await OrderItem.findAll({
      where: { product_id: { [Op.in]: pageIds } },
      attributes: [
        "product_id",
        [sequelize.col("order.status"), "order_status"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "total_qty"],
      ],
      include: [
        {
          model: Order,
          as: "order",
          where: { seller_id: sellerId },
          attributes: [],
        },
      ],
      group: ["product_id", "order.status"],
      raw: true,
    });

    const statsMap = {};
    for (const stat of itemStats) {
      const pId = stat.product_id;
      if (!statsMap[pId]) {
        statsMap[pId] = { pendingCount: 0, acceptedCount: 0, canceledCount: 0 };
      }
      const qty = Number(stat.total_qty) || 0;
      if (stat.order_status === "pending") {
        statsMap[pId].pendingCount += qty;
      } else if (
        ["accepted", "shipping", "completed"].includes(stat.order_status)
      ) {
        statsMap[pId].acceptedCount += qty;
      } else if (stat.order_status === "canceled") {
        statsMap[pId].canceledCount += qty;
      }
    }

    // Keep the sorted order from step 2 (findAll does not preserve it).
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    const formattedProducts = pageIds
      .map((id) => byId.get(Number(id)))
      .filter(Boolean)
      .map((product) => {
        const plain = product.toJSON();
        const s = statsMap[plain.id] || {
          pendingCount: 0,
          acceptedCount: 0,
          canceledCount: 0,
        };
        return {
          id: plain.id,
          titleKu: plain.titleKu,
          titleAr: plain.titleAr,
          // Raw image data, same shape as the product routes: the frontend
          // builds the URL with getProductThumbImage (utils/imageUrl.js)
          productImages: plain.productImages || [],
          images: plain.images,
          isAvailable: plain.isAvailable,
          priceType: plain.priceType,
          ...buildStockFields(plain),
          pendingCount: s.pendingCount,
          acceptedCount: s.acceptedCount,
          canceledCount: s.canceledCount,
        };
      });

    return res.json({
      success: true,
      products: formattedProducts,
      pagination: {
        page: safePage,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Fetch stock data error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching stock data",
    });
  }
});

// 2) PATCH /:productId — Manual stock adjustment
//    Body: { stock } for a simple product
//          { stock, variantIndex } for one row of variantPrices
router.patch("/:productId", stockAccessGuard, async (req, res) => {
  const sellerId = req.actor.sellerId;
  const productId = Number(req.params.productId);
  const stock = parseStockInput(req.body?.stock);

  console.log("[STOCK][PATCH] reached route", {
    productId,
    sellerId,
    body: req.body,
    parsedStock: stock,
  });

  if (!Number.isInteger(productId) || productId <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid product id" });
  }

  if (stock === null) {
    return res.status(400).json({
      success: false,
      message: "Stock count must be a non-negative whole number",
    });
  }

  const rawVariantIndex = req.body?.variantIndex;
  const isVariantUpdate =
    rawVariantIndex !== undefined && rawVariantIndex !== null;
  const variantIndex = isVariantUpdate ? Number(rawVariantIndex) : null;

  if (
    isVariantUpdate &&
    (!Number.isInteger(variantIndex) || variantIndex < 0)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid variant index" });
  }

  // The order-creation flow locks this row too, so lock it here to avoid
  // overwriting a concurrent stock decrement inside the variant JSON.
  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findOne({
      where: { id: productId, seller_id: sellerId },
      attributes: ["id", "stock", "variantPrices", "variantPricesAr"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const kuRows = parseJsonArray(product.variantPrices);
    const arRows = parseJsonArray(product.variantPricesAr);
    const hasVariants = kuRows.length > 0 || arRows.length > 0;

    if (isVariantUpdate) {
      if (!hasVariants || (!kuRows[variantIndex] && !arRows[variantIndex])) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Variant not found" });
      }

      // Keep both language copies in sync (same index = same variant).
      const updates = {};
      if (kuRows[variantIndex]) {
        const nextRows = [...kuRows];
        nextRows[variantIndex] = { ...kuRows[variantIndex], stock };
        updates.variantPrices = nextRows;
      }
      if (arRows[variantIndex]) {
        const nextRows = [...arRows];
        nextRows[variantIndex] = { ...arRows[variantIndex], stock };
        updates.variantPricesAr = nextRows;
      }
      await product.update(updates, { transaction });
    } else {
      if (hasVariants) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "This product has variants. Update the stock of a variant.",
        });
      }
      await product.update({ stock }, { transaction });
    }

    await transaction.commit();
    console.log("[STOCK][PATCH] committed", {
      productId,
      isVariantUpdate,
      variantIndex,
      stock,
    });

    return res.json({
      success: true,
      message: "Stock updated successfully",
      ...buildStockFields(product.toJSON()),
    });
  } catch (error) {
    await transaction.rollback();
    console.error("[STOCK][PATCH] failed, rolled back", error);
    console.error("Update product stock error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 3) GET /:productId/orders — Pending order lines for a product
router.get("/:productId/orders", stockAccessGuard, async (req, res) => {
  try {
    const sellerId = req.actor.sellerId;
    const { productId } = req.params;

    const findItems = (withVariantSnapshot, withSelectedOptions) =>
      OrderItem.findAll({
        where: { product_id: productId },
        attributes: [
          "id",
          "order_id",
          "product_id",
          "product_name_snapshot",
          "color",
          "size",
          "quantity",
          "createdAt",
          ...(withVariantSnapshot ? ["variant_options_snapshot"] : []),
          ...(withSelectedOptions ? ["selected_options"] : []),
        ],
        include: [
          {
            model: Order,
            as: "order",
            where: { seller_id: sellerId, status: "pending" },
            attributes: [
              "id",
              "order_id",
              "customer_name",
              "customer_phone",
              "customer_city",
              "customer_contact_preference",
              "createdAt",
              "status",
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

    let items;
    try {
      items = await findItems(true, true);
    } catch (error) {
      if (!isMissingOrderItemOptionalColumnError(error)) throw error;
      const missing = getMissingOptionalColumns(error);
      items = await findItems(
        !missing.variant_options_snapshot,
        !missing.selected_options,
      );
    }

    return res.json({
      success: true,
      orders: items.map((item) => item.toJSON()),
    });
  } catch (error) {
    console.error("Fetch product orders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 4) POST /:productId/accept-all — Accept all pending orders for a product
//    Stock is NOT touched here: it is already reserved (decremented) when the
//    order is created in routes/seller/orders.js.
router.post("/:productId/accept-all", stockAccessGuard, async (req, res) => {
  const sellerId = req.actor.sellerId;
  const { productId } = req.params;

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findOne({
      where: { id: productId, seller_id: sellerId },
      attributes: ["id"],
      transaction,
    });

    if (!product) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const orderItems = await OrderItem.findAll({
      where: { product_id: productId },
      attributes: ["id", "quantity"],
      include: [
        {
          model: Order,
          as: "order",
          where: { seller_id: sellerId, status: "pending" },
          attributes: ["id"],
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!orderItems.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No pending orders found for this product",
      });
    }

    const totalUnits = orderItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0,
    );
    const orderIds = [...new Set(orderItems.map((item) => item.order.id))];

    await Order.update(
      { status: "accepted" },
      {
        where: {
          id: { [Op.in]: orderIds },
          seller_id: sellerId,
          status: "pending",
        },
        transaction,
      },
    );

    await transaction.commit();

    return res.json({
      success: true,
      message: "All pending orders accepted",
      acceptedOrders: orderIds.length,
      acceptedCount: totalUnits,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Accept all orders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

function parseObjectInput(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function resolveItemSelectedOptions(item) {
  return (
    parseObjectInput(item.selected_options) ||
    parseObjectInput(item.variant_options_snapshot) ||
    null
  );
}

async function fetchOrderItemsForStockAdjustment(orderId, transaction) {
  const buildQuery = (
    withVariantSnapshot = true,
    withSelectedOptions = true,
  ) => ({
    where: { order_id: orderId },
    attributes: [
      "id",
      "product_id",
      "quantity",
      ...(withVariantSnapshot ? ["variant_options_snapshot"] : []),
      ...(withSelectedOptions ? ["selected_options"] : []),
    ],
    transaction,
  });

  try {
    return await OrderItem.findAll(buildQuery(true, true));
  } catch (error) {
    if (!isMissingOrderItemOptionalColumnError(error)) throw error;
    const missing = getMissingOptionalColumns(error);
    return await OrderItem.findAll(
      buildQuery(!missing.variant_options_snapshot, !missing.selected_options),
    );
  }
}

// Gives back the stock that was reserved for a canceled order's items.
async function restoreStockForOrderItems(orderId, sellerId, transaction) {
  const items = await fetchOrderItemsForStockAdjustment(orderId, transaction);

  const productIds = [
    ...new Set(
      items
        .map((item) => Number(item.product_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (!productIds.length) return;

  const lockedProducts = await Product.findAll({
    where: { id: productIds, seller_id: sellerId },
    attributes: [
      "id",
      "stock",
      "isAvailable",
      "variantPrices",
      "variantPricesAr",
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const lockedProductById = new Map(
    lockedProducts.map((p) => [Number(p.id), p]),
  );

  for (const item of items) {
    const product = lockedProductById.get(Number(item.product_id));
    if (!product) continue;

    const stockUpdate = applyItemStockIncrement(product, {
      quantity: item.quantity,
      selected_options: resolveItemSelectedOptions(item),
    });

    if (stockUpdate) {
      await product.update(stockUpdate, { transaction });
    }
  }
}

// 5) PATCH /orders/:orderId/cancel — Cancel single order
router.patch("/orders/:orderId/cancel", stockAccessGuard, async (req, res) => {
  const sellerId = req.actor.sellerId;
  const { orderId } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const order = await Order.findOne({
      where: { id: orderId, seller_id: sellerId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Only pending orders can be canceled from the stock page. Without this
    // check an accepted / shipped / completed order could be flipped back.
    if (order.status !== "pending") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Only pending orders can be canceled",
      });
    }

    await restoreStockForOrderItems(order.id, sellerId, transaction);
    await order.update({ status: "canceled" }, { transaction });

    await transaction.commit();

    return res.json({ success: true, message: "Order canceled successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error("Cancel order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
