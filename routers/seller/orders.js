import { Router } from "express";
import { Op, fn, col, literal } from "sequelize";
import sequelize from "../../database/sequelize.js";
import Order from "../../database/order.js";
import OrderItem from "../../database/orderItem.js";
import Seller from "../../database/seller.js";
import Product from "../../database/products.js";
import Report from "../../database/report.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { notifySellerNewOrder } from "../../utils/webPush.js";
import { normalizeUiSettings } from "../../utils/uiSettings.js";

const router = Router();

const IRAQ_DELIVERY_CITY_KEYS = [
  "Baghdad",
  "Basra",
  "Mosul",
  "Erbil",
  "Sulaymaniyah",
  "Duhok",
  "Kirkuk",
  "Halabja",
  "Karbala",
  "Najaf",
  "Anbar",
  "Babil",
  "Diyala",
  "Saladin",
  "Wasit",
  "Muthanna",
  "Qadisiyyah",
  "Thi Qar",
  "Maysan",
];

const IRAQ_DELIVERY_CITY_ALIASES = {
  بغداد: "Baghdad",
  بەغدا: "Baghdad",
  البصرة: "Basra",
  بەسرە: "Basra",
  الموصل: "Mosul",
  مووسڵ: "Mosul",
  أربيل: "Erbil",
  هەولێر: "Erbil",
  السليمانية: "Sulaymaniyah",
  سلێمانی: "Sulaymaniyah",
  دهوك: "Duhok",
  دهۆک: "Duhok",
  كركوك: "Kirkuk",
  کەرکووک: "Kirkuk",
  حلبجة: "Halabja",
  هەڵەبجە: "Halabja",
  كربلاء: "Karbala",
  کەربەلا: "Karbala",
  النجف: "Najaf",
  نەجەف: "Najaf",
  الأنبار: "Anbar",
  ئەنبار: "Anbar",
  بابل: "Babil",
  ديالى: "Diyala",
  دیالە: "Diyala",
  "صلاح الدين": "Saladin",
  سەلاحەدین: "Saladin",
  واسط: "Wasit",
  واسیت: "Wasit",
  المثنى: "Muthanna",
  موسەنا: "Muthanna",
  القادسية: "Qadisiyyah",
  قادسیە: "Qadisiyyah",
  "ذي قار": "Thi Qar",
  زیقار: "Thi Qar",
  ميسان: "Maysan",
  میسان: "Maysan",
};

function normalizeDeliveryCityKey(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const direct = IRAQ_DELIVERY_CITY_KEYS.find(
    (city) => city.toLowerCase() === raw.toLowerCase(),
  );
  if (direct) return direct;

  return IRAQ_DELIVERY_CITY_ALIASES[raw] || "";
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
    return {
      variant_options_snapshot: true,
      selected_options: true,
    };
  }

  return missing;
}

function isMissingOrderCustomerContactPreferenceColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("customer_contact_preference") &&
    (message.includes("unknown column") ||
      message.includes("doesn't exist") ||
      message.includes("no such column"))
  );
}

function parseObjectInput(value) {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

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


function isProductCashbackActive(product, lineSubtotal, atTime = Date.now()) {
  if (!product?.hasCashback) return false;

  const value = Number(product.cashbackValue);
  if (!Number.isFinite(value) || value <= 0) return false;

  const now = new Date(atTime).getTime();
  if (product.cashbackStartDate) {
    const start = new Date(product.cashbackStartDate).getTime();
    if (Number.isNaN(start) || now < start) return false;
  }

  if (product.cashbackEndDate) {
    const end = new Date(product.cashbackEndDate).getTime();
    if (Number.isNaN(end) || now > end) return false;
  }

  const minOrderAmount = Number(product.cashbackMinOrderAmount || 0);
  if (Number.isFinite(minOrderAmount) && minOrderAmount > 0) {
    return Number(lineSubtotal || 0) >= minOrderAmount;
  }

  return true;
}

function calculateProductCashback(
  product,
  lineSubtotal,
  quantity = 1,
  atTime = Date.now(),
) {
  if (!isProductCashbackActive(product, lineSubtotal, atTime)) return 0;

  const value = Number(product.cashbackValue);
  const calculated =
    product.cashbackType === "percentage"
      ? lineSubtotal * (value / 100)
      : value * Math.max(1, Number(quantity) || 1);

  return Math.min(Number(lineSubtotal) || 0, Math.max(0, calculated));
}

const CASHBACK_ORDER_SNAPSHOT_START = new Date(
  "2026-07-12T00:00:00.000Z",
).getTime();

async function buildOrderResponseWithLegacyCashback(order) {
  const plainOrder = order.toJSON();
  const items = plainOrder.items || [];
  const createdAt = new Date(plainOrder.createdAt).getTime();
  const hasCashbackSnapshot =
    Number(plainOrder.cashback || 0) > 0 ||
    items.some((item) => Number(item.cashback_amount || 0) > 0);

  if (
    hasCashbackSnapshot ||
    !Number.isFinite(createdAt) ||
    createdAt < CASHBACK_ORDER_SNAPSHOT_START
  ) {
    return plainOrder;
  }

  const productIds = [
    ...new Set(
      items
        .map((item) => Number(item.product_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (!productIds.length) return plainOrder;

  const products = await Product.findAll({
    where: {
      id: productIds,
      seller_id: Number(plainOrder.seller_id),
    },
    attributes: [
      "id",
      "hasCashback",
      "cashbackType",
      "cashbackValue",
      "cashbackStartDate",
      "cashbackEndDate",
      "cashbackMinOrderAmount",
    ],
  });
  const productById = new Map(
    products.map((product) => [Number(product.id), product]),
  );

  items.forEach((item) => {
    const product = productById.get(Number(item.product_id));
    item.cashback_amount = parseFloat(
      calculateProductCashback(
        product,
        Number(item.total_price || 0),
        item.quantity,
        createdAt,
      ).toFixed(2),
    );
  });

  const primaryCurrency =
    plainOrder.currency === "MIXED" ? "IQD" : plainOrder.currency || "IQD";
  const primaryCashback = parseFloat(
    items
      .filter((item) => (item.currency || primaryCurrency) === primaryCurrency)
      .reduce((sum, item) => sum + Number(item.cashback_amount || 0), 0)
      .toFixed(2),
  );
  const storedDiscount = Number(plainOrder.discount || 0);

  plainOrder.cashback = primaryCashback;
  if (primaryCashback > 0 && storedDiscount >= primaryCashback) {
    plainOrder.discount = parseFloat(
      (storedDiscount - primaryCashback).toFixed(2),
    );
  }

  return plainOrder;
}
function buildSelectedOptions(item) {
  const selectedFromPayload =
    parseObjectInput(item?.selected_options) ||
    parseObjectInput(item?.variant_options) ||
    {};

  // Keep legacy fields too so color/size/taste remain visible in one JSON snapshot.
  const merged = {
    ...selectedFromPayload,
  };

  ["color", "size", "taste"].forEach((key) => {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      merged[key] = String(value).trim();
    }
  });

  return Object.keys(merged).length ? merged : null;
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/**
 * Generate a unique, human-readable order ID.
 * Format: ORD-<timestamp_last6><random2>
 */
async function generateOrderId() {
  const ts = Date.now().toString().slice(-6);
  const rnd = Math.floor(10 + Math.random() * 90);
  const candidate = `ORD-${ts}${rnd}`;

  const existing = await Order.findOne({
    where: { order_id: candidate },
    attributes: ["id"],
  });
  if (existing) return generateOrderId(); // retry on collision (extremely rare)
  return candidate;
}

/** Return 400 if any required field is missing/invalid */
function validateCreateOrder(body) {
  const errors = [];
  const { customer_name, customer_phone, customer_city, currency, items } =
    body;

  if (
    !customer_name ||
    typeof customer_name !== "string" ||
    !customer_name.trim()
  )
    errors.push("customer_name is required");

  if (
    !customer_phone ||
    typeof customer_phone !== "string" ||
    !customer_phone.trim()
  )
    errors.push("customer_phone is required");

  if (
    !customer_city ||
    typeof customer_city !== "string" ||
    !customer_city.trim()
  )
    errors.push("customer_city is required");

  if (!["IQD", "USD", "MIXED"].includes(currency))
    errors.push("currency must be IQD, USD, or MIXED");

  if (!Array.isArray(items) || items.length === 0)
    errors.push("items must be a non-empty array");

  if (Array.isArray(items)) {
    items.forEach((item, idx) => {
      if (!item.product_name || typeof item.product_name !== "string")
        errors.push(`items[${idx}].product_name is required`);
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1)
        errors.push(`items[${idx}].quantity must be a positive integer`);
      if (
        !Number.isFinite(Number(item.unit_price)) ||
        Number(item.unit_price) < 0
      )
        errors.push(`items[${idx}].unit_price must be a non-negative number`);
    });
  }

  return errors;
}

/* ─────────────────────────────────────────────────────────────
   POST /api/seller/orders/create   (customer-facing)
   Creates a new order for a seller's store.
   No auth required — customers place orders publicly.
───────────────────────────────────────────────────────────── */
router.post("/orders/create", async (req, res) => {
  try {
    const {
      seller_id,
      customer_name,
      customer_phone,
      customer_city,
      customer_location_detail,
      customer_contact_preference,
      currency,
      payment_method = "COD",
      items,
      delivery_fee = 0,
      discount = 0,
      notes,
    } = req.body;

    // Validate seller
    if (!seller_id || !Number.isInteger(Number(seller_id))) {
      return res
        .status(400)
        .json({ success: false, message: "seller_id is required" });
    }

    const seller = await Seller.findByPk(Number(seller_id));
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Store not found" });
    }

    // Validate fields
    const errors = validateCreateOrder(req.body);
    if (errors.length) {
      return res
        .status(400)
        .json({ success: false, message: errors[0], errors });
    }

    if (!["COD", "Card"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "payment_method must be COD or Card",
      });
    }

    if (
      customer_contact_preference !== undefined &&
      !["whatsapp", "viber", "call"].includes(customer_contact_preference)
    ) {
      return res.status(400).json({
        success: false,
        message: "customer_contact_preference must be whatsapp, viber, or call",
      });
    }

    // Calculate totals server-side
    const parsedItems = items.map((item) => {
      const selectedOptions = buildSelectedOptions(item);

      return {
        // Store canonical JSON selected options (color/size/taste + dynamic keys).
        selected_options: selectedOptions,
        // Keep legacy text snapshot for backward compatibility with existing readers.
        variant_options_snapshot: selectedOptions
          ? JSON.stringify(selectedOptions)
          : null,
        product_id: item.product_id || null,
        product_name_snapshot: String(item.product_name).trim().slice(0, 300),
        product_image_snapshot: item.product_image || null,
        color: item.color ? String(item.color).slice(0, 100) : null,
        size: item.size ? String(item.size).slice(0, 100) : null,
        quantity: Math.max(1, Math.floor(Number(item.quantity))),
        unit_price: Math.max(0, parseFloat(Number(item.unit_price).toFixed(2))),
        total_price: 0, // computed below
        currency: ["IQD", "USD"].includes(item.currency)
          ? item.currency
          : currency === "MIXED"
            ? "IQD"
            : currency,
      };
    });

    parsedItems.forEach((item) => {
      item.total_price = parseFloat(
        (item.unit_price * item.quantity).toFixed(2),
      );
    });

    const productIds = [
      ...new Set(
        parsedItems
          .map((item) => Number(item.product_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const orderedProducts = productIds.length
      ? await Product.findAll({
          where: {
            id: productIds,
            seller_id: Number(seller_id),
          },
          attributes: [
            "id",
            "hasCashback",
            "cashbackType",
            "cashbackValue",
            "cashbackStartDate",
            "cashbackEndDate",
            "cashbackMinOrderAmount",
          ],
        })
      : [];
    const productById = new Map(
      orderedProducts.map((product) => [Number(product.id), product]),
    );

    parsedItems.forEach((item) => {
      const product = productById.get(Number(item.product_id));
      item.cashback_amount = parseFloat(
        calculateProductCashback(
          product,
          item.total_price,
          item.quantity,
        ).toFixed(2),
      );
    });

    const normalizedUiSettings = normalizeUiSettings(seller.ui_settings);
    const normalizedCityKey = normalizeDeliveryCityKey(customer_city);
    const configuredDelivery = normalizedCityKey
      ? Number(
          normalizedUiSettings.deliveryFees?.fees?.[normalizedCityKey] || 0,
        )
      : 0;
    const requestedDelivery = Math.max(
      0,
      parseFloat(Number(delivery_fee).toFixed(2)),
    );
    const parsedDelivery = Math.max(
      0,
      parseFloat(
        Number(
          Number.isFinite(configuredDelivery) && configuredDelivery > 0
            ? configuredDelivery
            : requestedDelivery,
        ).toFixed(2),
      ),
    );
    const itemCurrencies = new Set(parsedItems.map((item) => item.currency));
    const effectiveCurrency =
      itemCurrencies.size > 1 ||
      (itemCurrencies.has("USD") && parsedDelivery > 0)
        ? "MIXED"
        : itemCurrencies.values().next().value || currency || "IQD";
    const primaryCurrency =
      effectiveCurrency === "MIXED" ? "IQD" : effectiveCurrency;
    const subtotal = parseFloat(
      parsedItems
        .filter((item) => item.currency === primaryCurrency)
        .reduce((sum, item) => sum + item.total_price, 0)
        .toFixed(2),
    );
    const serverCashback = parseFloat(
      parsedItems
        .filter((item) => item.currency === primaryCurrency)
        .reduce((sum, item) => sum + item.cashback_amount, 0)
        .toFixed(2),
    );
    const parsedDiscount = Math.max(
      0,
      parseFloat(Number(discount).toFixed(2)),
    );
    const total_price = parseFloat(
      Math.max(
        0,
        subtotal + parsedDelivery - parsedDiscount - serverCashback,
      ).toFixed(2),
    );

    const order_id = await generateOrderId();

    // Atomic transaction
    const createOrderTransaction = async (
      withVariantSnapshot = true,
      withSelectedOptions = true,
      withCustomerContactPreference = true,
    ) =>
      sequelize.transaction(async (t) => {
        const createPayload = {
          order_id,
          seller_id: Number(seller_id),
          customer_name: String(customer_name).trim().slice(0, 150),
          customer_phone: String(customer_phone).trim().slice(0, 30),
          customer_city: String(customer_city).trim().slice(0, 100),
          customer_location_detail: customer_location_detail
            ? String(customer_location_detail).trim()
            : null,
          payment_method,
          currency: effectiveCurrency,
          subtotal,
          delivery_fee: parsedDelivery,
          discount: parsedDiscount,
          cashback: serverCashback,
          total_price,
          status: "pending",
          notes: notes ? String(notes).trim() : null,
        };

        if (withCustomerContactPreference) {
          createPayload.customer_contact_preference =
            customer_contact_preference || "whatsapp";
        }

        const newOrder = await Order.create(createPayload, { transaction: t });

        const itemRows = parsedItems.map((item) => {
          const base = {
            ...item,
            order_id: newOrder.id,
          };
          if (!withVariantSnapshot) {
            delete base.variant_options_snapshot;
          }
          if (!withSelectedOptions) {
            delete base.selected_options;
          }
          return base;
        });

        await OrderItem.bulkCreate(itemRows, { transaction: t });

        return newOrder;
      });

    let order;
    try {
      order = await createOrderTransaction(true, true, true);
    } catch (error) {
      if (
        !isMissingOrderItemOptionalColumnError(error) &&
        !isMissingOrderCustomerContactPreferenceColumnError(error)
      ) {
        throw error;
      }

      const withoutCustomerContactPreference =
        isMissingOrderCustomerContactPreferenceColumnError(error);
      const missing = getMissingOptionalColumns(error);

      order = await createOrderTransaction(
        !missing.variant_options_snapshot,
        !missing.selected_options,
        !withoutCustomerContactPreference,
      );
    }

    // 📊 Increment orders count in daily report (non-blocking)
    try {
      const today = new Date().toISOString().split("T")[0];
      const [report, created] = await Report.findOrCreate({
        where: { seller_id: Number(seller_id), report_date: today },
        defaults: { orders: 1 },
      });
      if (!created) {
        await report.increment("orders", { by: 1 });
      }
    } catch (reportError) {
      console.error("Report increment failed:", reportError);
    }

    try {
      const pushResult = await notifySellerNewOrder({ seller, order });
      console.log(
        `[orders] Push notify result for order=${order.order_id}: ${JSON.stringify(pushResult)}`,
      );
    } catch (notifyError) {
      // Push delivery failure must never block order creation.
      console.error("Order push notification failed:", notifyError);
    }

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: {
        id: order.id,
        order_id: order.order_id,
        status: order.status,
        total_price: order.total_price,
        currency: order.currency,
      },
    });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/seller/orders   (seller dashboard)
   Returns all orders for the authenticated seller's store.
───────────────────────────────────────────────────────────── */
router.get("/orders", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { status, search, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const where = { seller_id: sellerId };

    if (
      status &&
      ["pending", "accepted", "shipping", "completed", "canceled"].includes(
        status,
      )
    ) {
      where.status = status;
    }

    if (search && typeof search === "string" && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { order_id: { [Op.like]: term } },
        { customer_name: { [Op.like]: term } },
        { customer_phone: { [Op.like]: term } },
      ];
    }

    const buildQueryOptions = (
      withVariantSnapshot = true,
      withSelectedOptions = true,
    ) => ({
      where,
      attributes: [
        "id",
        "order_id",
        "seller_id",
        "customer_name",
        "customer_phone",
        "customer_city",
        "customer_location_detail",
        "customer_contact_preference",
        "payment_method",
        "currency",
        "subtotal",
        "delivery_fee",
        "discount",
        "cashback",
        "total_price",
        "status",
        "notes",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: OrderItem,
          as: "items",
          attributes: [
            "id",
            "product_name_snapshot",
            "quantity",
            "unit_price",
            "total_price",
            "cashback_amount",
            "color",
            "size",
            ...(withVariantSnapshot ? ["variant_options_snapshot"] : []),
            ...(withSelectedOptions ? ["selected_options"] : []),
            "currency",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset,
    });

    let count;
    let rows;
    try {
      ({ count, rows } = await Order.findAndCountAll(
        buildQueryOptions(true, true),
      ));
    } catch (error) {
      if (!isMissingOrderItemOptionalColumnError(error)) {
        throw error;
      }
      const missing = getMissingOptionalColumns(error);
      ({ count, rows } = await Order.findAndCountAll(
        buildQueryOptions(
          !missing.variant_options_snapshot,
          !missing.selected_options,
        ),
      ));
    }

    return res.json({
      success: true,
      orders: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (err) {
    console.error("Get orders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/seller/orders/stats   (seller dashboard analytics)
───────────────────────────────────────────────────────────── */
router.get("/orders/stats", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      pending,
      accepted,
      shipping,
      completed,
      canceled,
      revenueIQD,
      revenueUSD,
      productsSold,
      lastSevenDays,
    ] = await Promise.all([
      Order.count({ where: { seller_id: sellerId } }),
      Order.count({
        where: { seller_id: sellerId, createdAt: { [Op.gte]: todayStart } },
      }),
      Order.count({ where: { seller_id: sellerId, status: "pending" } }),
      Order.count({ where: { seller_id: sellerId, status: "accepted" } }),
      Order.count({ where: { seller_id: sellerId, status: "shipping" } }),
      Order.count({ where: { seller_id: sellerId, status: "completed" } }),
      Order.count({ where: { seller_id: sellerId, status: "canceled" } }),
      Order.sum("total_price", {
        where: {
          seller_id: sellerId,
          currency: "IQD",
          status: { [Op.ne]: "canceled" },
        },
      }),
      Order.sum("total_price", {
        where: {
          seller_id: sellerId,
          currency: "USD",
          status: { [Op.ne]: "canceled" },
        },
      }),
      OrderItem.sum("quantity", {
        include: [
          {
            model: Order,
            as: "order",
            where: { seller_id: sellerId, status: { [Op.ne]: "canceled" } },
            attributes: [],
          },
        ],
      }),
      // Orders per day for last 7 days
      Order.findAll({
        where: {
          seller_id: sellerId,
          createdAt: {
            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "count"],
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true,
      }),
    ]);

    return res.json({
      success: true,
      stats: {
        totalOrders,
        todayOrders,
        pending,
        accepted,
        shipping,
        completed,
        canceled,
        totalIQD: parseFloat(revenueIQD || 0),
        totalUSD: parseFloat(revenueUSD || 0),
        productsSold: parseInt(productsSold || 0, 10),
        lastSevenDays,
      },
    });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/seller/orders/:orderId   (seller — single order)
───────────────────────────────────────────────────────────── */
router.get("/orders/:orderId", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { orderId } = req.params;

    const buildDetailQuery = (
      withVariantSnapshot = true,
      withSelectedOptions = true,
    ) => ({
      where: { id: orderId, seller_id: sellerId },
      attributes: [
        "id",
        "order_id",
        "seller_id",
        "customer_name",
        "customer_phone",
        "customer_city",
        "customer_location_detail",
        "customer_contact_preference",
        "payment_method",
        "currency",
        "subtotal",
        "delivery_fee",
        "discount",
        "cashback",
        "total_price",
        "status",
        "notes",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: OrderItem,
          as: "items",
          attributes: [
            "id",
            "order_id",
            "product_id",
            "product_name_snapshot",
            "product_image_snapshot",
            "color",
            "size",
            ...(withVariantSnapshot ? ["variant_options_snapshot"] : []),
            ...(withSelectedOptions ? ["selected_options"] : []),
            "quantity",
            "unit_price",
            "total_price",
            "cashback_amount",
            "currency",
            "createdAt",
            "updatedAt",
          ],
        },
      ],
    });

    let order;
    try {
      order = await Order.findOne(buildDetailQuery(true, true));
    } catch (error) {
      if (!isMissingOrderItemOptionalColumnError(error)) {
        throw error;
      }
      const missing = getMissingOptionalColumns(error);
      order = await Order.findOne(
        buildDetailQuery(
          !missing.variant_options_snapshot,
          !missing.selected_options,
        ),
      );
    }

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderResponse = await buildOrderResponseWithLegacyCashback(order);
    return res.json({ success: true, order: orderResponse });
  } catch (err) {
    console.error("Get order error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   PUT /api/seller/orders/:orderId/status
───────────────────────────────────────────────────────────── */
const ALLOWED_STATUSES = [
  "pending",
  "accepted",
  "shipping",
  "completed",
  "canceled",
];

router.put(
  "/orders/:orderId/status",
  jwtVerifySellerToken,
  async (req, res) => {
    try {
      const sellerId = req.user.id;
      const { orderId } = req.params;
      const { status } = req.body;

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      const order = await Order.findOne({
        where: { id: orderId, seller_id: sellerId },
        attributes: ["id", "order_id", "seller_id", "status"],
      });

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      if (order.status === "completed" && status !== "canceled") {
        return res.status(400).json({
          success: false,
          message: "Completed orders can only be canceled",
        });
      }

      await order.update({ status });

      return res.json({
        success: true,
        message: "Order status updated",
        order: { id: order.id, order_id: order.order_id, status: order.status },
      });
    } catch (err) {
      console.error("Update status error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

export default router;
