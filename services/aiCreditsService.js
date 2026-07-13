import crypto from "node:crypto";
import { Op } from "sequelize";
import sequelize from "../database/sequelize.js";
import Seller from "../database/seller.js";
import SellerAiBalance from "../database/sellerAiBalance.js";
import AiCreditPlan from "../database/aiCreditPlan.js";
import AiCreditPurchaseRequest from "../database/aiCreditPurchaseRequest.js";

const WHATSAPP_PURCHASE_ERROR = "AI credit purchase is not configured yet.";

export async function getOrCreateSellerAiBalance(sellerId, options = {}) {
  const [balance] = await SellerAiBalance.findOrCreate({
    where: { seller_id: sellerId },
    defaults: {
      seller_id: sellerId,
      credit_balance: 3,
      total_free_credits: 3,
      total_purchased: 0,
      total_used: 0,
    },
    ...options,
  });
  return balance;
}

export async function listActiveAiCreditPlans() {
  return AiCreditPlan.findAll({
    where: { is_active: true },
    order: [
      ["sort_order", "ASC"],
      ["id", "ASC"],
    ],
  });
}

function createRequestCode() {
  return `AIP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function uniqueRequestCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRequestCode();
    const existing = await AiCreditPurchaseRequest.findOne({
      where: { request_code: code },
      attributes: ["id"],
    });
    if (!existing) return code;
  }
  return `AIP-${Date.now().toString(36).toUpperCase()}`;
}

function formatIqd(value) {
  return `${Number(value || 0).toLocaleString("en-US")} IQD`;
}

function buildWhatsAppUrl({ seller, balance, request, plan }) {
  const number = process.env.AI_PLAN_WHATSAPP_NUMBER;
  if (!number) {
    const error = new Error(WHATSAPP_PURCHASE_ERROR);
    error.code = "AI_PURCHASE_NOT_CONFIGURED";
    throw error;
  }

  const message = [
    "Hello Dwkan Link,",
    "",
    "I want to purchase an AI Product Import package.",
    "",
    `Seller name: ${seller?.name || "Unknown"}`,
    `Seller ID: ${seller?.id}`,
    `Shop: ${seller?.shop_name || "Not set"}`,
    seller?.phone ? `Seller phone: ${seller.phone}` : null,
    `Package: ${plan.name}`,
    `AI imports: ${plan.credits}`,
    `Price: ${formatIqd(plan.price_iqd)}`,
    `Current credits: ${balance.credit_balance}`,
    `Purchase request ID: ${request.request_code}`,
    "",
    "I accepted the AI import package conditions.",
    "Please contact me to confirm payment and activate the package.",
  ].filter(Boolean).join("\n");

  return `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(message)}`;
}

export async function createAiCreditPurchaseRequest({ sellerId, planId, agreementAccepted }) {
  if (agreementAccepted !== true) {
    const error = new Error("You must accept the AI import package conditions.");
    error.code = "AGREEMENT_REQUIRED";
    throw error;
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const plan = await AiCreditPlan.findOne({ where: { id: planId, is_active: true } });
  if (!plan) {
    const error = new Error("Selected AI credit plan is not available.");
    error.code = "INVALID_AI_CREDIT_PLAN";
    throw error;
  }

  const duplicate = await AiCreditPurchaseRequest.findOne({
    where: {
      seller_id: sellerId,
      plan_id: plan.id,
      status: "pending",
      createdAt: { [Op.gte]: tenMinutesAgo },
    },
  });
  if (duplicate) {
    const error = new Error("You already requested this package. Please wait a few minutes before requesting again.");
    error.code = "DUPLICATE_PURCHASE_REQUEST";
    throw error;
  }

  const seller = await Seller.findByPk(sellerId);
  const balance = await getOrCreateSellerAiBalance(sellerId);
  const request = await AiCreditPurchaseRequest.create({
    request_code: await uniqueRequestCode(),
    seller_id: sellerId,
    plan_id: plan.id,
    plan_name_snapshot: plan.name,
    credits_snapshot: plan.credits,
    price_iqd_snapshot: plan.price_iqd,
    status: "pending",
    agreement_accepted: true,
    requested_at: new Date(),
  });

  return {
    request,
    whatsappUrl: buildWhatsAppUrl({ seller, balance, request, plan }),
  };
}

export async function approveAiCreditPurchaseRequest({ requestId, adminId }) {
  return sequelize.transaction(async (transaction) => {
    const request = await AiCreditPurchaseRequest.findOne({
      where: { request_code: requestId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      const error = new Error("AI credit purchase request was not found.");
      error.code = "AI_PURCHASE_REQUEST_NOT_FOUND";
      throw error;
    }
    if (request.status !== "pending") {
      const error = new Error("This request is no longer pending.");
      error.code = "AI_PURCHASE_REQUEST_ALREADY_HANDLED";
      throw error;
    }

    const balance = await getOrCreateSellerAiBalance(request.seller_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    balance.credit_balance += request.credits_snapshot;
    balance.total_purchased += request.credits_snapshot;
    await balance.save({ transaction });

    request.status = "approved";
    request.approved_at = new Date();
    request.approved_by_admin_id = adminId;
    await request.save({ transaction });
    return request;
  });
}

export async function rejectAiCreditPurchaseRequest({ requestId, adminId, notes }) {
  return sequelize.transaction(async (transaction) => {
    const request = await AiCreditPurchaseRequest.findOne({
      where: { request_code: requestId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      const error = new Error("AI credit purchase request was not found.");
      error.code = "AI_PURCHASE_REQUEST_NOT_FOUND";
      throw error;
    }
    if (request.status !== "pending") {
      const error = new Error("This request is no longer pending.");
      error.code = "AI_PURCHASE_REQUEST_ALREADY_HANDLED";
      throw error;
    }

    request.status = "rejected";
    request.rejected_at = new Date();
    request.rejected_by_admin_id = adminId;
    request.notes = typeof notes === "string" ? notes.slice(0, 1000) : null;
    await request.save({ transaction });
    return request;
  });
}
