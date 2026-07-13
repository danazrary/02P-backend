import express from "express";
import { adminAuth } from "../middlewares/jwtVerify.js";
import AiCreditPurchaseRequest from "../database/aiCreditPurchaseRequest.js";
import Seller from "../database/seller.js";
import {
  approveAiCreditPurchaseRequest,
  rejectAiCreditPurchaseRequest,
} from "../services/aiCreditsService.js";
import {
  disableAiImportManually,
  enableAiImportManually,
  getAiFeatureSetting,
  serializeAiFeatureStatus,
} from "../services/aiFeatureService.js";

const router = express.Router();
const fail = (res, status, code, message) => res.status(status).json({ success: false, code, message });

router.get("/ai-product-import/status", adminAuth, async (_req, res) => {
  try {
    const setting = await getAiFeatureSetting();
    return res.json({ success: true, data: serializeAiFeatureStatus(setting) });
  } catch (error) {
    console.error("AI import status failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI import status could not be loaded.");
  }
});

router.post("/ai-product-import/disable", adminAuth, async (req, res) => {
  try {
    const setting = await disableAiImportManually(req.body?.reason || "Maintenance");
    return res.json({ success: true, data: serializeAiFeatureStatus(setting) });
  } catch (error) {
    console.error("AI import disable failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI import could not be disabled.");
  }
});

router.post("/ai-product-import/enable", adminAuth, async (_req, res) => {
  try {
    const setting = await enableAiImportManually();
    return res.json({ success: true, data: serializeAiFeatureStatus(setting) });
  } catch (error) {
    console.error("AI import enable failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI import could not be enabled.");
  }
});

router.get("/ai-credit-purchase-requests", adminAuth, async (req, res) => {
  try {
    const status = ["pending", "approved", "rejected", "cancelled"].includes(req.query.status)
      ? req.query.status
      : "pending";
    const requests = await AiCreditPurchaseRequest.findAll({
      where: { status },
      include: [{ model: Seller, as: "seller", attributes: ["id", "name", "phone", "shop_name"] }],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    return res.json({ success: true, data: requests });
  } catch (error) {
    console.error("AI credit request list failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI credit purchase requests could not be loaded.");
  }
});

router.post("/ai-credit-purchase-requests/:requestId/approve", adminAuth, async (req, res) => {
  try {
    const request = await approveAiCreditPurchaseRequest({
      requestId: req.params.requestId,
      adminId: req.admin?.id,
    });
    return res.json({ success: true, data: request });
  } catch (error) {
    const code = error?.code || "AI_PURCHASE_APPROVAL_FAILED";
    const status = code === "AI_PURCHASE_REQUEST_ALREADY_HANDLED" ? 409 : 400;
    return fail(res, status, code, error?.message || "AI credit purchase request could not be approved.");
  }
});

router.post("/ai-credit-purchase-requests/:requestId/reject", adminAuth, async (req, res) => {
  try {
    const request = await rejectAiCreditPurchaseRequest({
      requestId: req.params.requestId,
      adminId: req.admin?.id,
      notes: req.body?.notes,
    });
    return res.json({ success: true, data: request });
  } catch (error) {
    const code = error?.code || "AI_PURCHASE_REJECTION_FAILED";
    const status = code === "AI_PURCHASE_REQUEST_ALREADY_HANDLED" ? 409 : 400;
    return fail(res, status, code, error?.message || "AI credit purchase request could not be rejected.");
  }
});

export default router;
