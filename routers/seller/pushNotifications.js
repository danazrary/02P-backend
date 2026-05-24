import { Router } from "express";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  getPublicVapidKey,
  saveSellerPushSubscription,
  removeSellerPushSubscriptionByEndpoint,
} from "../../utils/webPush.js";

const router = Router();

function normalizeSubscription(rawSubscription) {
  if (!rawSubscription || typeof rawSubscription !== "object") {
    return null;
  }

  const endpoint = rawSubscription.endpoint;
  const keys = rawSubscription.keys;

  if (
    typeof endpoint !== "string" ||
    !endpoint.trim() ||
    !keys ||
    typeof keys !== "object" ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string"
  ) {
    return null;
  }

  return {
    endpoint: endpoint.trim(),
    expirationTime: rawSubscription.expirationTime || null,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  };
}

router.get("/push/public-key", jwtVerifySellerToken, (req, res) => {
  const publicKey = getPublicVapidKey();

  if (!publicKey) {
    return res.json({
      success: true,
      enabled: false,
      code: "PUSH_NOT_CONFIGURED",
      message:
        "Push notifications are not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.",
    });
  }

  return res.json({ success: true, enabled: true, publicKey });
});

router.post("/push/subscribe", jwtVerifySellerToken, async (req, res) => {
  try {
    const sellerId = req.user.id;
    const normalizedSubscription = normalizeSubscription(
      req.body?.subscription,
    );

    if (!normalizedSubscription) {
      return res.status(400).json({
        success: false,
        message: "Valid push subscription is required",
      });
    }

    await saveSellerPushSubscription({
      sellerId,
      subscription: normalizedSubscription,
    });

    return res.json({ success: true, message: "Push subscription saved" });
  } catch (error) {
    console.error("Save push subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save push subscription",
    });
  }
});

router.delete("/push/unsubscribe", jwtVerifySellerToken, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;

    if (!endpoint || typeof endpoint !== "string") {
      return res.status(400).json({
        success: false,
        message: "endpoint is required",
      });
    }

    await removeSellerPushSubscriptionByEndpoint(endpoint);

    return res.json({ success: true, message: "Push subscription removed" });
  } catch (error) {
    console.error("Remove push subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove push subscription",
    });
  }
});

export default router;
