import crypto from "crypto";
import webpush from "web-push";
import SellerPushSubscription from "../database/sellerPushSubscription.js";
import Seller from "../database/seller.js";
let vapidConfigured = false;

function endpointFingerprint(endpoint) {
  try {
    const url = new URL(endpoint);
    const tail = endpoint.slice(-14);
    return `${url.host} ...${tail}`;
  } catch {
    return endpoint ? `...${String(endpoint).slice(-14)}` : "unknown-endpoint";
  }
}

function isMissingPushTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("seller_push_subscriptions") &&
    (message.includes("unknown table") ||
      message.includes("doesn't exist") ||
      message.includes("no such table"))
  );
}

function ensureWebPushConfigured() {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function isValidSubscriptionShape(subscription) {
  if (!subscription || typeof subscription !== "object") return false;
  if (!subscription.endpoint || typeof subscription.endpoint !== "string") {
    return false;
  }

  const keys = subscription.keys;
  if (!keys || typeof keys !== "object") return false;
  return Boolean(keys.p256dh && keys.auth);
}

function buildOrderUrl({ seller, orderId }) {
  const pathBasedUrl = `/${seller.shop_name}/orders/${orderId}`;
  const subdomainBase = process.env.PUSH_SHOP_BASE_DOMAIN;

  if (subdomainBase && seller.shop_name) {
    const protocol = process.env.PUSH_SHOP_PROTOCOL || "https";
    return `${protocol}://${seller.shop_name}.${subdomainBase}/orders/${orderId}`;
  }

  const appUrl = process.env.FRONTEND_APP_URL;
  if (appUrl) {
    return `${appUrl.replace(/\/$/, "")}${pathBasedUrl}`;
  }

  return pathBasedUrl;
}

export function getPublicVapidKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

export async function saveSellerPushSubscription({ sellerId, subscription }) {
  if (!sellerId || !Number.isInteger(Number(sellerId))) {
    throw new Error("Invalid sellerId for push subscription");
  }
  if (!isValidSubscriptionShape(subscription)) {
    throw new Error("Invalid push subscription payload");
  }

  const endpoint = subscription.endpoint;
  const endpoint_hash = crypto
    .createHash("sha256")
    .update(endpoint)
    .digest("hex");

  try {
    await SellerPushSubscription.upsert({
      seller_id: Number(sellerId),
      endpoint,
      endpoint_hash,
      subscription,
    });
  } catch (error) {
    if (isMissingPushTableError(error)) {
      console.error(
        "Push subscriptions table is missing. Run migrations to enable web push.",
      );
      return;
    }
    throw error;
  }
}

export async function removeSellerPushSubscriptionByEndpoint(endpoint) {
  if (!endpoint) return;

  try {
    await SellerPushSubscription.destroy({ where: { endpoint } });
  } catch (error) {
    if (!isMissingPushTableError(error)) {
      throw error;
    }
  }
}

const NOTIFICATION_TEMPLATES = {
  en: {
    title: "New Order Received! 🛍️",
    body: (orderCode) => `You have received a new order #${orderCode}.`,
  },
  ar: {
    title: "طلب جديد! 🛍️",
    body: (orderCode) => `لديك طلب جديد برقم #${orderCode}.`,
  },
  ku: {
    title: "داواکارییەکی نوێ! 🛍️",
    body: (orderCode) => `داواکارییەکی نوێت پێگەیشت #${orderCode}.`,
  },
};

export async function notifySellerNewOrder({ seller, order }) {
  // 1. Language detection (Fallback to 'en' if invalid or missing)
  const sellerLang = (seller?.default_shop_lang || "en").toLowerCase();
  const template =
    NOTIFICATION_TEMPLATES[sellerLang] || NOTIFICATION_TEMPLATES.en;

  if (!seller?.id || !order?.order_id) {
    console.log("[push] Skip notify: missing seller or order payload");
    return { total: 0, sent: 0, removed: 0, skipped: true };
  }

  console.log(
    `[push] New order notification start: seller=${seller.id}, order=${order.order_id}, lang=${sellerLang}`,
  );

  const isConfigured = ensureWebPushConfigured();
  if (!isConfigured) {
    console.warn(
      "Web push is not configured. Missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_SUBJECT.",
    );
    return { total: 0, sent: 0, removed: 0, skipped: true };
  }

  let subscriptions;
  try {
    subscriptions = await SellerPushSubscription.findAll({
      where: { seller_id: Number(seller.id) },
    });
  } catch (error) {
    if (isMissingPushTableError(error)) {
      console.warn(
        "Push subscription table is missing. Skipping notification delivery.",
      );
      return { total: 0, sent: 0, removed: 0, skipped: true };
    }
    throw error;
  }

  if (!subscriptions.length) {
    console.log(
      `[push] No active subscriptions for seller=${seller.id}. Notification skipped.`,
    );
    return { total: 0, sent: 0, removed: 0, skipped: true };
  }

  console.log(
    `[push] Found ${subscriptions.length} subscription(s) for seller=${seller.id}`,
  );

  // 2. Dynamic Shop Logo Handling (Cloudflare R2 / Upload / Default Fallback)
  const BASE_URL =
    process.env.PUSH_NOTIFICATION_ICON_URL || "https://dwkanlink.com";
  const R2_BASE_URL = process.env.R2_PUBLIC_URL || "https://dwkanlink.com"; // UPDATE THIS

  const defaultIcon = `${BASE_URL}/uploads/dl-logo.png`;
  const shopLogo = seller?.shop_image || seller?.logo || order?.shop_logo;

  let iconUrl = defaultIcon;

  if (shopLogo) {
    if (shopLogo.startsWith("http")) {
      // If it already has https:// (e.g., an external link), use it directly
      iconUrl = shopLogo;
    } else {
      // It's a relative path from your database, so add the R2 Base URL
      const cleanPath = shopLogo.startsWith("/")
        ? shopLogo.substring(1)
        : shopLogo;
      iconUrl = `${R2_BASE_URL}/${cleanPath}`;
    }
  }

  console.log(`[push] Final Icon URL: ${iconUrl}`);

  const payload = JSON.stringify({
    title: template.title,
    body: template.body(order.order_id),
    icon: iconUrl,
    badge:
      process.env.PUSH_NOTIFICATION_BADGE_URL || "/android-chrome-192x192.png",
    data: {
      orderId: order.id,
      orderCode: order.order_id,
      url: buildOrderUrl({ seller, orderId: order.id }),
    },
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      const endpointLabel = endpointFingerprint(row.subscription?.endpoint);
      console.log(
        `[push] Attempt send: subscriptionId=${row.id}, endpoint=${endpointLabel}`,
      );

      try {
        await webpush.sendNotification(row.subscription, payload);
        sent += 1;
        console.log(
          `[push] Sent successfully: subscriptionId=${row.id}, endpoint=${endpointLabel}, seller=${seller.id}, order=${order.order_id}`,
        );
      } catch (error) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await SellerPushSubscription.destroy({ where: { id: row.id } });
          removed += 1;
          console.warn(
            `[push] Removed invalid subscription: subscriptionId=${row.id}, endpoint=${endpointLabel}, status=${statusCode}`,
          );
          return;
        }
        console.error(
          `[push] Send failed: subscriptionId=${row.id}, endpoint=${endpointLabel}, status=${statusCode || "unknown"}, message=${error?.message || error}`,
        );
      }
    }),
  );

  console.log(
    `[push] Delivery summary: seller=${seller.id}, order=${order.order_id}, sent=${sent}, removed=${removed}, total=${subscriptions.length}`,
  );

  return {
    total: subscriptions.length,
    sent,
    removed,
    skipped: false,
  };
}