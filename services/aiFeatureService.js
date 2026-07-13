import AiFeatureSetting from "../database/aiFeatureSetting.js";

const FEATURE_KEY = "product_import";

function envEnabled() {
  return String(process.env.AI_PRODUCT_IMPORT_ENABLED ?? "true").toLowerCase() !== "false";
}

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function getAiFeatureSetting(options = {}) {
  const [setting] = await AiFeatureSetting.findOrCreate({
    where: { feature_key: FEATURE_KEY },
    defaults: {
      feature_key: FEATURE_KEY,
      is_enabled: true,
    },
    ...options,
  });
  return setting;
}

export async function assertAiImportAvailable() {
  if (!envEnabled()) {
    const error = new Error("AI product importing is temporarily unavailable because of a system problem. No AI credit was used.");
    error.code = "AI_IMPORT_TEMPORARILY_DISABLED";
    throw error;
  }

  const setting = await getAiFeatureSetting();
  const now = new Date();
  if (!setting.is_enabled || (setting.circuit_open_until && setting.circuit_open_until > now)) {
    const error = new Error("AI product importing is temporarily unavailable because of a system problem. No AI credit was used.");
    error.code = "AI_IMPORT_TEMPORARILY_DISABLED";
    throw error;
  }
  return setting;
}

export async function markAiImportSuccess() {
  const setting = await getAiFeatureSetting();
  setting.consecutive_system_failures = 0;
  setting.consecutive_gemini_failures = 0;
  setting.last_success_at = new Date();
  if (setting.circuit_open_until && setting.circuit_open_until <= new Date()) {
    setting.circuit_open_until = null;
  }
  await setting.save();
  return setting;
}

export async function recordAiSystemFailure(reason = "Internal AI import system failure") {
  const setting = await getAiFeatureSetting();
  setting.consecutive_system_failures += 1;
  setting.last_failure_at = new Date();
  const limit = intEnv("AI_CIRCUIT_SYSTEM_FAILURE_LIMIT", 5);
  if (!process.env.GEMINI_API_KEY || setting.consecutive_system_failures >= limit) {
    setting.is_enabled = false;
    setting.disabled_reason = reason;
    setting.disabled_source = "automatic_backend_protection";
    setting.disabled_at = new Date();
    setting.circuit_open_until = null;
  }
  await setting.save();
  return setting;
}

export async function recordAiGeminiFailure(reason = "Gemini service failure") {
  const setting = await getAiFeatureSetting();
  setting.consecutive_gemini_failures += 1;
  setting.last_failure_at = new Date();
  const limit = intEnv("AI_CIRCUIT_GEMINI_FAILURE_LIMIT", 5);
  if (setting.consecutive_gemini_failures >= limit) {
    setting.disabled_reason = reason;
    setting.disabled_source = "automatic_gemini_protection";
    setting.circuit_open_until = new Date(Date.now() + intEnv("AI_CIRCUIT_COOLDOWN_MINUTES", 15) * 60 * 1000);
  }
  await setting.save();
  return setting;
}

export async function disableAiImportManually(reason = "Disabled by admin") {
  const setting = await getAiFeatureSetting();
  setting.is_enabled = false;
  setting.disabled_reason = String(reason || "Disabled by admin").slice(0, 500);
  setting.disabled_source = "manual_admin";
  setting.disabled_at = new Date();
  setting.circuit_open_until = null;
  await setting.save();
  return setting;
}

export async function enableAiImportManually() {
  const setting = await getAiFeatureSetting();
  setting.is_enabled = true;
  setting.disabled_reason = null;
  setting.disabled_source = null;
  setting.circuit_open_until = null;
  setting.consecutive_system_failures = 0;
  setting.consecutive_gemini_failures = 0;
  setting.enabled_at = new Date();
  await setting.save();
  return setting;
}

export function serializeAiFeatureStatus(setting) {
  const envDisabled = !envEnabled();
  const now = new Date();
  const circuitOpen = Boolean(setting?.circuit_open_until && setting.circuit_open_until > now);
  return {
    isEnabled: Boolean(setting?.is_enabled) && !envDisabled && !circuitOpen,
    envDisabled,
    disabledReason: envDisabled ? "Environment disabled" : setting?.disabled_reason || null,
    disabledSource: envDisabled ? "environment" : setting?.disabled_source || null,
    circuitOpenUntil: setting?.circuit_open_until || null,
    consecutiveSystemFailures: setting?.consecutive_system_failures || 0,
    consecutiveGeminiFailures: setting?.consecutive_gemini_failures || 0,
    lastFailureAt: setting?.last_failure_at || null,
    lastSuccessAt: setting?.last_success_at || null,
  };
}
