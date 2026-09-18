// backend/routes/seller/pushNotifications.js
import { Router } from "express";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import {
  attachActor,
  canManagePushNotifications,
} from "../../middlewares/staffPermissions.js";

const router = Router();

// ❌ ئەم دێڕە سڕدراوەتەوە چونکە ڕاوتەکانی تری باکئەندی بلۆک دەکرد:
// router.use(canManagePushNotifications);

// ✅ مۆڵەتەکە تەنها لەسەر ڕاوتەکانی نوتیفیکەیشن دادەنرێت:
router.get(
  "/push/public-key",
  jwtVerifySellerToken,
  attachActor,
  canManagePushNotifications,
  async (req, res) => {
    try {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      if (!publicKey) {
        return res
          .status(500)
          .json({ success: false, message: "VAPID keys not configured" });
      }
      return res.status(200).json({ success: true, publicKey });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

router.post(
  "/push/subscribe",
  jwtVerifySellerToken,
  attachActor,
  canManagePushNotifications,
  async (req, res) => {
    try {
      // کۆدی سەبسکرایب
      return res
        .status(200)
        .json({ success: true, message: "Subscribed successfully" });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

router.post(
  "/push/unsubscribe",
  jwtVerifySellerToken,
  attachActor,
  canManagePushNotifications,
  async (req, res) => {
    try {
      // کۆدی ئەنسەبسکرایب
      return res
        .status(200)
        .json({ success: true, message: "Unsubscribed successfully" });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

export default router;
