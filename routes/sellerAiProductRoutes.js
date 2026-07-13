import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import sequelize from "../database/sequelize.js";
import { jwtVerifySellerToken } from "../middlewares/jwtVerify.js";
import SellerAiUsage from "../database/sellerAiUsage.js";
import SellerAiBalance from "../database/sellerAiBalance.js";
import validatePublicProductUrl, { ProductUrlValidationError } from "../utils/validatePublicProductUrl.js";
import validateSupportedMarketplaceUrl, { UnsupportedMarketplaceError } from "../utils/validateSupportedMarketplaceUrl.js";
import extractProductPageBasic, { ProductExtractionError, evaluateExtractionQuality } from "../utils/extractProductPageBasic.js";
import {
  createAiCreditPurchaseRequest,
  getOrCreateSellerAiBalance,
  listActiveAiCreditPlans,
} from "../services/aiCreditsService.js";
import {
  assertAiImportAvailable,
  getAiFeatureSetting,
  markAiImportSuccess,
  recordAiGeminiFailure,
  recordAiSystemFailure,
  serializeAiFeatureStatus,
} from "../services/aiFeatureService.js";

const router = express.Router();
const importLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const purchaseLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, code, message, ...extra });
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];

function aiDebugEnabled() {
  return String(process.env.AI_IMPORT_DEBUG || "").toLowerCase() === "true" || process.env.NODE_ENV === "development";
}

function createImportRequestId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `AII-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function safeDisabledMessage() {
  return "AI product importing is temporarily unavailable because of a system problem. No AI credit was used.";
}

function normalizedSourceUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = parsed.search ? "?" : "";
    return parsed.href.slice(0, 2048);
  } catch {
    return String(url || "").slice(0, 2048);
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function estimateCost(tokens, envName) {
  const perMillion = Number(process.env[envName]);
  if (!Number.isFinite(perMillion) || !Number.isFinite(Number(tokens))) return null;
  return Number(((Number(tokens) / 1_000_000) * perMillion).toFixed(6));
}

function geminiUsage(response) {
  const usage = response?.usageMetadata || response?.response?.usageMetadata || {};
  const input = Number(usage.promptTokenCount ?? usage.inputTokenCount ?? 0) || null;
  const output = Number(usage.candidatesTokenCount ?? usage.outputTokenCount ?? 0) || null;
  const total = Number(usage.totalTokenCount ?? ((input || 0) + (output || 0))) || null;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    estimated_input_cost_usd: estimateCost(input, "GEMINI_INPUT_COST_PER_MILLION_USD"),
    estimated_output_cost_usd: estimateCost(output, "GEMINI_OUTPUT_COST_PER_MILLION_USD"),
  };
}

function parseGeminiErrorPayload(message) {
  if (typeof message !== "string") return null;
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(message.slice(start, end + 1)); }
  catch { return null; }
}

function safeGeminiErrorDetails(error) {
  const parsed = parseGeminiErrorPayload(error?.message);
  const rawStatus =
    error?.status ??
    error?.response?.status ??
    error?.error?.code ??
    parsed?.error?.code ??
    error?.code ??
    null;
  const numericStatus = Number(rawStatus);
  const status = Number.isFinite(numericStatus) ? numericStatus : rawStatus || null;
  const providerMessage =
    error?.response?.data?.error?.message ||
    error?.error?.message ||
    parsed?.error?.message ||
    error?.message ||
    "Unknown Gemini error";
  const providerStatus =
    error?.response?.data?.error?.status ||
    error?.error?.status ||
    parsed?.error?.status ||
    null;
  return {
    status,
    providerStatus,
    providerMessage: String(providerMessage).slice(0, 500),
    errorName: error?.name || null,
  };
}

function mapGeminiFailureCode({ status, providerStatus, providerMessage, errorName }) {
  const numericStatus = Number(status);
  const statusText = String(status || "").toUpperCase();
  const message = String(providerMessage || "").toLowerCase();
  const provider = String(providerStatus || "").toLowerCase();
  if (numericStatus === 400) return "GEMINI_BAD_REQUEST";
  if (numericStatus === 401 || numericStatus === 403) {
    if (provider.includes("permission") || message.includes("permission denied") || message.includes("permission_denied") || message.includes("not allowed") || message.includes("access denied")) {
      return "GEMINI_PERMISSION_DENIED";
    }
    return "GEMINI_API_KEY_INVALID";
  }
  if (numericStatus === 404) return "GEMINI_MODEL_NOT_FOUND";
  if (numericStatus === 429) return "GEMINI_RATE_LIMIT";
  if (numericStatus === 408 || errorName === "AbortError" || statusText === "ETIMEDOUT" || statusText === "ECONNABORTED" || message.includes("timeout")) {
    return "GEMINI_TIMEOUT";
  }
  if (numericStatus >= 500) return "GEMINI_SERVICE_UNAVAILABLE";
  return "GEMINI_REQUEST_FAILED";
}

function normalizeResult(value) {
  const result = {
    titleKu: text(value?.titleKu, 150),
    titleAr: text(value?.titleAr, 150),
    descriptionKu: text(value?.descriptionKu, 1500),
    descriptionAr: text(value?.descriptionAr, 1500),
    features: list(value?.features, 15).map((x) => ({ text_ku: text(x?.text_ku, 100), text_ar: text(x?.text_ar, 100), value_ku: text(x?.value_ku, 300), value_ar: text(x?.value_ar, 300) })).filter((x) => x.text_ku || x.text_ar || x.value_ku || x.value_ar),
    options: list(value?.options, 5).map((x) => ({ type_ku: text(x?.type_ku, 80), type_ar: text(x?.type_ar, 80), values: list(x?.values, 5).map((v) => ({ ku: text(v?.ku, 100), ar: text(v?.ar, 100) })).filter((v) => v.ku || v.ar) })).filter((x) => (x.type_ku || x.type_ar) && x.values.length),
    customFieldsKu: list(value?.customFieldsKu, 15).map((x) => ({ name: text(x?.name, 100), value: text(x?.value, 300) })).filter((x) => x.name || x.value),
    customFieldsAr: list(value?.customFieldsAr, 15).map((x) => ({ name: text(x?.name, 100), value: text(x?.value, 300) })).filter((x) => x.name || x.value),
    suggestedCategoryKu: text(value?.suggestedCategoryKu, 100),
    suggestedCategoryAr: text(value?.suggestedCategoryAr, 100),
    suggestedSubcategoryKu: text(value?.suggestedSubcategoryKu, 100),
    suggestedSubcategoryAr: text(value?.suggestedSubcategoryAr, 100),
    price: Number.isFinite(Number(value?.price)) && Number(value.price) >= 0 ? Number(value.price) : null,
    currency: ["USD", "IQD"].includes(String(value?.currency).toUpperCase()) ? String(value.currency).toUpperCase() : "USD",
    imageUrls: list(value?.imageUrls, 8).filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)).map((url) => url.slice(0, 2048)),
  };
  if (!result.titleKu && !result.titleAr && !result.descriptionKu && !result.descriptionAr) {
    const error = new Error("AI output did not contain usable product content.");
    error.code = "AI_FAILED";
    throw error;
  }
  return result;
}

function prompt(extracted) {
  const compact = { ...extracted };
  delete compact.diagnostics;
  return `Prepare product form content for Iraqi and Kurdistan Region sellers. Output ONLY valid JSON with exactly this shape:
{"titleKu":"","titleAr":"","descriptionKu":"","descriptionAr":"","features":[{"text_ku":"","text_ar":"","value_ku":"","value_ar":""}],"options":[{"type_ku":"","type_ar":"","values":[{"ku":"","ar":""}]}],"customFieldsKu":[{"name":"","value":""}],"customFieldsAr":[{"name":"","value":""}],"suggestedCategoryKu":"","suggestedCategoryAr":"","suggestedSubcategoryKu":"","suggestedSubcategoryAr":"","price":null,"currency":"USD","imageUrls":[]}
Rules: Kurdish must be natural Sorani Kurdish and Arabic natural Arabic. Titles are 3-8 words. Descriptions are at most 5 short lines. Never invent exact specifications, waterproof claims, guarantees, or prices. Missing fields use null, empty string, or empty array. Do not copy long source passages. Keep claims realistic and locally suitable. Use only image URLs present in source. Currency must be USD or IQD; for any other currency return price null. Do not infer unsupported options. Options must be real selectable values found in the source; return no more than 5 values for each option. Do not write summaries such as "10 different colors" or "many sizes" as option values; if exact values are not listed, leave that option empty.
SOURCE DATA:\n${JSON.stringify(compact)}`;
}

function debugObject(state) {
  return {
    stage: state.stage,
    httpStatus: state.httpStatus,
    finalHostname: state.finalHostname,
    redirectCount: state.redirectCount,
    contentType: state.contentType,
    responseBytes: state.responseBytes,
    blockedPageDetected: state.blockedPageDetected,
    blockedPageReason: state.blockedPageReason,
    qualityGateReason: state.qualityGateReason,
    sourceMarketplace: state.sourceMarketplace,
  };
}

function logStage(state, patch = {}) {
  Object.assign(state, patch);
  if (!aiDebugEnabled()) return;
  console.log("[AI_PRODUCT_IMPORT]", JSON.stringify({
    requestId: state.requestId,
    sellerId: state.sellerId,
    stage: state.stage,
    sourceMarketplace: state.sourceMarketplace,
    originalHostname: state.originalHostname,
    finalHostname: state.finalHostname,
    httpStatus: state.httpStatus,
    redirectCount: state.redirectCount,
    contentType: state.contentType,
    responseBytes: state.responseBytes,
    pageTitleFound: state.pageTitleFound,
    metaDescriptionFound: state.metaDescriptionFound,
    openGraphTitleFound: state.openGraphTitleFound,
    openGraphDescriptionFound: state.openGraphDescriptionFound,
    openGraphImageCount: state.openGraphImageCount,
    jsonLdFound: state.jsonLdFound,
    jsonLdProductFound: state.jsonLdProductFound,
    extractedPriceFound: state.extractedPriceFound,
    visibleTextLength: state.visibleTextLength,
    blockedPageDetected: state.blockedPageDetected,
    blockedPageReason: state.blockedPageReason,
    qualityGatePassed: state.qualityGatePassed,
    qualityGateReason: state.qualityGateReason,
    geminiRequestSent: state.geminiRequestSent,
    geminiResponseReceived: state.geminiResponseReceived,
    geminiJsonParsed: state.geminiJsonParsed,
    outputUsable: state.outputUsable,
    sellerCreditConsumed: state.sellerCreditConsumed,
    failureCode: state.failureCode,
    durationMs: state.durationMs,
  }));
}

function failImport(res, status, code, message, state) {
  logStage(state, { failureCode: code, durationMs: Date.now() - state.startedAt });
  return fail(res, status, code, message, { requestId: state.requestId, ...(aiDebugEnabled() ? { debug: debugObject(state) } : {}) });
}

async function logUsage(values) {
  try { await SellerAiUsage.create(values); }
  catch (error) { console.error("AI usage log failed:", error?.message || error); }
}

async function debitCreditAndLog({ sellerId, usage }) {
  return sequelize.transaction(async (transaction) => {
    const balance = await SellerAiBalance.findOne({ where: { seller_id: sellerId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!balance || balance.credit_balance <= 0) {
      const error = new Error("No AI credits remaining.");
      error.code = "AI_CREDITS_EMPTY";
      throw error;
    }
    balance.credit_balance -= 1;
    balance.total_used += 1;
    if (balance.credit_balance < 0) {
      const error = new Error("No AI credits remaining.");
      error.code = "AI_CREDITS_EMPTY";
      throw error;
    }
    await balance.save({ transaction });
    await SellerAiUsage.create({ ...usage, success: true, status: "success", failure_stage: "success", seller_credit_consumed: true }, { transaction });
    return balance;
  });
}

function isGeminiServiceFailure(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.response?.status);
  return status === 429 || status >= 500 || message.includes("timeout") || message.includes("unavailable") || message.includes("api key") || message.includes("quota");
}

router.get("/ai-credits", jwtVerifySellerToken, async (req, res) => {
  try {
    const [balance, setting] = await Promise.all([getOrCreateSellerAiBalance(req.user.id), getAiFeatureSetting()]);
    return res.json({ success: true, data: { creditBalance: balance.credit_balance, totalFreeCredits: balance.total_free_credits, totalPurchased: balance.total_purchased, totalUsed: balance.total_used, feature: serializeAiFeatureStatus(setting) } });
  } catch (error) {
    console.error("AI credits status failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI credits could not be loaded.");
  }
});

router.get("/ai-credit-plans", jwtVerifySellerToken, async (_req, res) => {
  try {
    const plans = await listActiveAiCreditPlans();
    return res.json({ success: true, data: plans.map((plan) => ({ id: plan.id, name: plan.name, credits: plan.credits, priceIqd: plan.price_iqd })) });
  } catch (error) {
    console.error("AI credit plans failed:", error?.message || error);
    return fail(res, 500, "AI_FAILED", "AI credit plans could not be loaded.");
  }
});

router.post("/ai-credit-purchase-request", purchaseLimiter, jwtVerifySellerToken, async (req, res) => {
  try {
    const result = await createAiCreditPurchaseRequest({ sellerId: req.user.id, planId: Number(req.body?.planId), agreementAccepted: req.body?.agreementAccepted });
    return res.json({ success: true, data: { requestId: result.request.request_code, whatsappUrl: result.whatsappUrl } });
  } catch (error) {
    const code = error?.code || "AI_PURCHASE_FAILED";
    const status = ["AGREEMENT_REQUIRED", "INVALID_AI_CREDIT_PLAN", "DUPLICATE_PURCHASE_REQUEST"].includes(code) ? 400 : 500;
    return fail(res, status, code, error?.message || "AI credit purchase request could not be created.");
  }
});

router.post("/products/ai-import", importLimiter, jwtVerifySellerToken, async (req, res) => {
  const state = {
    requestId: createImportRequestId(),
    sellerId: req.user.id,
    startedAt: Date.now(),
    stage: "start",
    sourceUrl: normalizedSourceUrl(req.body?.url),
    originalHostname: hostnameOf(req.body?.url),
    geminiRequestSent: false,
    geminiResponseReceived: false,
    geminiJsonParsed: false,
    outputUsable: false,
    sellerCreditConsumed: false,
  };
  let marketplace = null;
  let usageBase = { request_id: state.requestId, seller_id: req.user.id, action: "product_import", source_url: state.sourceUrl || "unknown", success: false, status: "failed", gemini_request_sent: false, seller_credit_consumed: false, model_name: MODEL_NAME };

  try {
    logStage(state, { stage: "feature_status" });
    await assertAiImportAvailable();

    logStage(state, { stage: "validation" });
    let parsedUrl;
    try { parsedUrl = new URL(String(req.body?.url || "")); } catch { throw new ProductUrlValidationError("INVALID_URL", "Please enter a valid product URL."); }
    marketplace = validateSupportedMarketplaceUrl(parsedUrl);
    const validated = await validatePublicProductUrl(parsedUrl.href);
    marketplace = validateSupportedMarketplaceUrl(validated);
    state.sourceMarketplace = marketplace;
    state.sourceUrl = normalizedSourceUrl(validated.href);
    state.originalHostname = hostnameOf(validated.href);
    usageBase = { ...usageBase, source_url: state.sourceUrl, source_marketplace: marketplace };

    logStage(state, { stage: "credit_check" });
    const balance = await getOrCreateSellerAiBalance(req.user.id);
    if (balance.credit_balance <= 0) {
      await logUsage({ ...usageBase, failure_stage: "credit_check", failure_code: "AI_CREDITS_EMPTY", duration_ms: Date.now() - state.startedAt });
      return failImport(res, 402, "AI_CREDITS_EMPTY", "No AI credits remaining.", state);
    }

    logStage(state, { stage: "extraction" });
    const extracted = await extractProductPageBasic(validated.href);
    validateSupportedMarketplaceUrl(extracted.sourceUrl || validated.href);
    Object.assign(state, extracted.diagnostics || {}, { finalHostname: hostnameOf(extracted.sourceUrl || validated.href) });
    logStage(state, { stage: "extraction" });

    const quality = evaluateExtractionQuality(extracted);
    logStage(state, { stage: "quality_gate", qualityGatePassed: quality.passed, qualityGateReason: quality.reason, blockedPageDetected: quality.blockedPageDetected, blockedPageReason: quality.blockedPageReason });
    if (!quality.passed) {
      const code = quality.reason === "blocked_page_detected" ? "WEBSITE_BLOCKED_OR_UNREADABLE" : "INSUFFICIENT_PRODUCT_DATA";
      const message = code === "WEBSITE_BLOCKED_OR_UNREADABLE" ? `${marketplace === "aliexpress" ? "AliExpress" : "This marketplace"} did not provide a readable product page.` : "The product page did not provide enough usable information.";
      await logUsage({ ...usageBase, failure_stage: "extraction", failure_code: code, duration_ms: Date.now() - state.startedAt });
      return failImport(res, code === "WEBSITE_BLOCKED_OR_UNREADABLE" ? 422 : 422, code, message, state);
    }

    logStage(state, { stage: "system_health" });
    await assertAiImportAvailable();
    if (!process.env.GEMINI_API_KEY) {
      await recordAiSystemFailure("Missing Gemini API key");
      await logUsage({ ...usageBase, failure_stage: "system_health", failure_code: "AI_IMPORT_TEMPORARILY_DISABLED", duration_ms: Date.now() - state.startedAt });
      return failImport(res, 503, "AI_IMPORT_TEMPORARILY_DISABLED", safeDisabledMessage(), state);
    }

    let response;
    let usageTokens = {};
    try {
      logStage(state, { stage: "gemini_request", geminiRequestSent: true });
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt(extracted), config: { responseMimeType: "application/json", temperature: 0.2 } });
      usageTokens = geminiUsage(response);
      logStage(state, { stage: "gemini_response", geminiResponseReceived: true });
    } catch (error) {
      const geminiError = safeGeminiErrorDetails(error);
      const failureCode = mapGeminiFailureCode(geminiError);
      if (aiDebugEnabled()) {
        console.error("[AI_PRODUCT_IMPORT] GEMINI_ERROR", {
          requestId: state.requestId,
          stage: "gemini_request",
          httpStatus: geminiError.status,
          providerStatus: geminiError.providerStatus,
          providerMessage: geminiError.providerMessage,
          errorName: geminiError.errorName,
          modelName: MODEL_NAME,
        });
      }
      await recordAiGeminiFailure(`${failureCode}: ${geminiError.providerStatus || ""} ${geminiError.providerMessage}`.slice(0, 500));
      await logUsage({ ...usageBase, ...usageTokens, gemini_request_sent: true, seller_credit_consumed: false, failure_stage: "gemini_request", failure_code: failureCode, duration_ms: Date.now() - state.startedAt });
      logStage(state, { stage: "gemini_request", geminiRequestSent: true, failureCode, httpStatus: geminiError.status });
      return fail(res, 502, failureCode, "AI could not prepare this product. Please try again.", {
        requestId: state.requestId,
        ...(aiDebugEnabled() ? {
          debug: {
            stage: "gemini_request",
            httpStatus: geminiError.status,
            providerStatus: geminiError.providerStatus,
            failureCode,
            providerMessage: geminiError.providerMessage,
          },
        } : {}),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(response.text);
      logStage(state, { stage: "gemini_response", geminiJsonParsed: true });
    } catch {
      await logUsage({ ...usageBase, ...usageTokens, gemini_request_sent: true, failure_stage: "gemini_response", failure_code: "AI_FAILED", duration_ms: Date.now() - state.startedAt });
      return failImport(res, 502, "AI_FAILED", "AI returned an unreadable response. Please try again.", state);
    }

    let data;
    try {
      data = normalizeResult(parsed);
      logStage(state, { stage: "output_validation", outputUsable: true });
    } catch {
      await logUsage({ ...usageBase, ...usageTokens, gemini_request_sent: true, failure_stage: "output_validation", failure_code: "AI_FAILED", duration_ms: Date.now() - state.startedAt });
      return failImport(res, 502, "AI_FAILED", "AI returned incomplete product data. Please try again.", state);
    }

    try {
      const updatedBalance = await debitCreditAndLog({ sellerId: req.user.id, usage: { ...usageBase, ...usageTokens, gemini_request_sent: true, duration_ms: Date.now() - state.startedAt } });
      await markAiImportSuccess();
      logStage(state, { stage: "success", sellerCreditConsumed: true, durationMs: Date.now() - state.startedAt });
      return res.json({ success: true, requestId: state.requestId, data: { ...data, creditBalance: updatedBalance.credit_balance } });
    } catch (error) {
      await recordAiSystemFailure(error?.message || "AI import credit transaction failed");
      await logUsage({ ...usageBase, ...usageTokens, gemini_request_sent: true, failure_stage: "database", failure_code: error?.code || "DATABASE_ERROR", duration_ms: Date.now() - state.startedAt });
      return failImport(res, 500, "DATABASE_ERROR", "AI import could not be completed. No AI credit was used.", state);
    }
  } catch (error) {
    if (error instanceof UnsupportedMarketplaceError) {
      await logUsage({ ...usageBase, source_marketplace: marketplace, failure_stage: "validation", failure_code: error.code, duration_ms: Date.now() - state.startedAt });
      return failImport(res, 400, error.code, error.message, state);
    }
    if (error instanceof ProductUrlValidationError) {
      await logUsage({ ...usageBase, source_marketplace: marketplace, failure_stage: "validation", failure_code: error.code, duration_ms: Date.now() - state.startedAt });
      return failImport(res, 400, error.code, error.message, state);
    }
    if (error instanceof ProductExtractionError) {
      Object.assign(state, error.diagnostics || {}, { stage: "extraction" });
      await logUsage({ ...usageBase, source_marketplace: marketplace, failure_stage: "extraction", failure_code: error.code, duration_ms: Date.now() - state.startedAt });
      const status = error.code === "EXTRACTION_TIMEOUT" ? 504 : (error.code === "WEBSITE_BLOCKED_OR_UNREADABLE" ? 422 : 502);
      return failImport(res, status, error.code, error.message, state);
    }
    if (error?.code === "AI_IMPORT_TEMPORARILY_DISABLED") {
      await logUsage({ ...usageBase, source_marketplace: marketplace, failure_stage: "system_health", failure_code: error.code, duration_ms: Date.now() - state.startedAt });
      return failImport(res, 503, error.code, safeDisabledMessage(), state);
    }

    if (!isGeminiServiceFailure(error)) await recordAiSystemFailure(error?.message || "Unexpected AI import error");
    console.error("Product import failed:", error?.message || error);
    await logUsage({ ...usageBase, source_marketplace: marketplace, failure_stage: "database", failure_code: "EXTRACTION_FAILED", duration_ms: Date.now() - state.startedAt });
    return failImport(res, 500, "EXTRACTION_FAILED", "The product page could not be imported. No AI credit was used.", state);
  }
});

export default router;


