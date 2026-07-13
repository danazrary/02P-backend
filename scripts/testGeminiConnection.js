import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

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

function tokenUsage(response) {
  const usage = response?.usageMetadata || response?.response?.usageMetadata || {};
  return {
    inputTokens: usage.promptTokenCount ?? usage.inputTokenCount ?? null,
    outputTokens: usage.candidatesTokenCount ?? usage.outputTokenCount ?? null,
    totalTokens: usage.totalTokenCount ?? null,
  };
}

if (!process.env.GEMINI_API_KEY) {
  console.error("Gemini connection failed");
  console.error("GEMINI_API_KEY is missing. The key was not printed.");
  process.exit(1);
}

try {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: "Reply with exactly: OK",
  });

  console.log("Gemini connection OK");
  console.log("Model:", MODEL_NAME);
  console.log("Text:", String(response.text || "").trim());
  console.log("Token usage:", JSON.stringify(tokenUsage(response)));
} catch (error) {
  const details = safeGeminiErrorDetails(error);
  console.error("Gemini connection failed");
  console.error("Model:", MODEL_NAME);
  console.error("HTTP status:", details.status);
  console.error("Provider status:", details.providerStatus);
  console.error("Provider message:", details.providerMessage);
  console.error("Error name:", details.errorName);
  process.exit(1);
}

