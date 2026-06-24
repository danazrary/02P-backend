import { Router } from "express";
import { v4 as uuidv4 } from "uuid";

import ShopSection from "../../database/ShopSection.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { createR2Multer, uploadToR2, deleteFromR2 } from "../../utils/r2.js";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
// Max 5 items; each item can have up to 2 images (ku + ar) → 10 files max
const MAX_HERO_ITEMS = 5;
const MAX_HERO_FILES = MAX_HERO_ITEMS * 2;
const MAX_HERO_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw input per file
const MAX_BRAND_ITEMS = 20;
const MAX_BRAND_FILES = MAX_BRAND_ITEMS;
const MAX_BRAND_FILE_BYTES = 25 * 1024 * 1024; // 25 MB raw input per logo
const VALID_SECTION_KEYS = ["hero", "flash_banner", "discount", "brands"];
const VALID_VIEW_MODES = ["home", "all_pages"];

const heroUpload = createR2Multer({
  fileSize: MAX_HERO_FILE_BYTES,
  files: MAX_HERO_FILES,
});

const brandUpload = createR2Multer({
  fileSize: MAX_BRAND_FILE_BYTES,
  files: MAX_BRAND_FILES,
});

function heroUploadMiddleware(req, res, next) {
  heroUpload.array("new_images", MAX_HERO_FILES)(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Each hero image must be 15MB or smaller.",
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: `You can upload up to ${MAX_HERO_FILES} hero images per request.`,
      });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected hero image field in upload request.",
      });
    }

    return next(err);
  });
}

function brandUploadMiddleware(req, res, next) {
  brandUpload.array("new_logos", MAX_BRAND_FILES)(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Each brand logo must be 25MB or smaller.",
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: `You can upload up to ${MAX_BRAND_FILES} brand logos per request.`,
      });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected brand logo field in upload request.",
      });
    }

    return next(err);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildDefaultConfig(sectionKey) {
  if (sectionKey === "hero") return { items: [] };
  if (sectionKey === "flash_banner") {
    return {
      height: "4.5rem",
      width: "100%",
      fontSize: "1.375rem",
      viewMode: "home",
    };
  }
  if (sectionKey === "brands") {
    return {
      titleKu: "براندەکان",
      titleAr: "العلامات التجارية",
      titleEn: "Brands",
      layout: "slider",
      items: [],
    };
  }
  return {};
}

function toBoolean(val) {
  if (typeof val === "boolean") return val;
  if (val === "true" || val === 1 || val === "1") return true;
  if (val === "false" || val === 0 || val === "0") return false;
  return Boolean(val);
}

function clamp(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function isValidOptionalUrl(str) {
  if (!str || str.trim() === "") return true;
  try {
    const url = new URL(str.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidOptionalBrandLink(str) {
  if (!str || str.trim() === "") return true;
  const link = str.trim();
  if (link.startsWith("/")) return true;
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeBrandConfig(inputConfig) {
  const defaults = buildDefaultConfig("brands");
  const config = safeJsonParse(inputConfig) ?? {};
  const rawItems = Array.isArray(config.items) ? config.items : [];

  if (rawItems.length > MAX_BRAND_ITEMS) {
    const err = new Error(`Brands section supports a maximum of ${MAX_BRAND_ITEMS} brands.`);
    err.status = 400;
    throw err;
  }

  const items = rawItems.map((item, index) => {
    const id =
      typeof item.id === "string" && item.id.trim() ? item.id.trim() : uuidv4();
    const name =
      typeof item.name === "string" ? item.name.trim().slice(0, 80) : "";
    const logo = typeof item.logo === "string" ? item.logo.trim() : "";
    const link = typeof item.link === "string" ? item.link.trim() : "";

    if (link && !isValidOptionalBrandLink(link)) {
      const err = new Error(
        `Invalid link for brand "${name || id}". Use an internal path starting with /, http://, https://, or leave it empty.`,
      );
      err.status = 400;
      throw err;
    }

    return {
      id,
      name,
      logo,
      link,
      isActive: toBoolean(item.isActive ?? true),
      sortOrder: clamp(item.sortOrder ?? index, 0, MAX_BRAND_ITEMS - 1),
    };
  });

  return {
    titleKu:
      typeof config.titleKu === "string" && config.titleKu.trim()
        ? config.titleKu.trim().slice(0, 120)
        : defaults.titleKu,
    titleAr:
      typeof config.titleAr === "string" && config.titleAr.trim()
        ? config.titleAr.trim().slice(0, 120)
        : defaults.titleAr,
    titleEn:
      typeof config.titleEn === "string" && config.titleEn.trim()
        ? config.titleEn.trim().slice(0, 120)
        : defaults.titleEn,
    layout: config.layout === "grid" ? "grid" : defaults.layout,
    items,
  };
}

/**
 * Accept a dimension value as number or CSS string and return a normalised CSS string.
 *   toCssValue(120, 50, 180, 72, "px") → "120px"
 *   toCssValue("120px", 50, 180, 72, "px") → "120px"
 *   toCssValue("100%", 60, 100, 100, "%") → "100%"
 */
function toCssValue(val, min, max, fallback, unit) {
  let n;
  if (typeof val === "string") {
    n = parseFloat(val); // "120px" → 120, "100%" → 100
  } else {
    n = Number(val);
  }
  if (!Number.isFinite(n)) n = fallback;
  return `${clamp(n, min, max)}${unit}`;
}

function stripTrailingZeros(value) {
  return String(Number(value.toFixed(4)));
}

function toCssLength(val, { minPx, maxPx, fallbackPx, defaultUnit = "rem" }) {
  let unit = defaultUnit;
  let numeric;

  if (typeof val === "string") {
    const trimmed = val.trim();
    const match = trimmed.match(/^(-?\d*\.?\d+)\s*(px|rem)?$/i);
    if (match) {
      numeric = Number(match[1]);
      unit = (match[2] || defaultUnit).toLowerCase();
    }
  } else {
    numeric = Number(val);
  }

  if (!Number.isFinite(numeric)) {
    numeric = fallbackPx;
    unit = defaultUnit;
  }

  const valuePx = unit === "rem" ? numeric * 16 : numeric;
  const clampedPx = clamp(valuePx, minPx, maxPx);

  if (unit === "rem") {
    return `${stripTrailingZeros(clampedPx / 16)}rem`;
  }

  return `${stripTrailingZeros(clampedPx)}px`;
}

// ─── Controller: GET all sections for the authenticated seller ─────────────
async function getAllSections(req, res) {
  try {
    const { id: sellerId } = req.user;
    const rows = await ShopSection.findAll({ where: { seller_id: sellerId } });

    const sectionMap = {};
    rows.forEach((row) => {
      sectionMap[row.section_key] = row;
    });

    const result = VALID_SECTION_KEYS.map((key) => {
      const row = sectionMap[key];
      if (row) {
        return {
          id: row.id,
          section_key: key,
          is_visible: row.is_visible,
          config:
            key === "brands"
              ? { ...buildDefaultConfig(key), ...(row.config || {}) }
              : row.config || buildDefaultConfig(key),
        };
      }
      return {
        id: null,
        section_key: key,
        is_visible: key === "brands" ? false : true,
        config: buildDefaultConfig(key),
      };
    });

    return res.json({ success: true, sections: result });
  } catch (err) {
    console.error("getAllSections error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching sections" });
  }
}

// ─── Controller: GET one section by section_key ───────────────────────────────
async function getSection(req, res) {
  try {
    const { id: sellerId } = req.user;
    const { key } = req.params;

    if (!VALID_SECTION_KEYS.includes(key)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid section key" });
    }

    const row = await ShopSection.findOne({
      where: { seller_id: sellerId, section_key: key },
    });

    if (!row) {
      return res.json({
        success: true,
        section: {
          id: null,
          section_key: key,
          is_visible: key === "brands" ? false : true,
          config: buildDefaultConfig(key),
        },
      });
    }

    return res.json({
      success: true,
      section: {
        id: row.id,
        section_key: row.section_key,
        is_visible: row.is_visible,
        config:
          key === "brands"
            ? { ...buildDefaultConfig(key), ...(row.config || {}) }
            : row.config || buildDefaultConfig(key),
      },
    });
  } catch (err) {
    console.error("getSection error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching section" });
  }
}

// ─── Controller: Upsert non-hero section (JSON body) ─────────────────────────
// Handles: flash_banner, discount
async function upsertSection(req, res) {
  try {
    const { id: sellerId } = req.user;
    const { section_key, is_visible, config } = req.body;

    if (!VALID_SECTION_KEYS.includes(section_key)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid section_key" });
    }
    if (section_key === "hero") {
      return res.status(400).json({
        success: false,
        message: "Use POST /sections/hero/upsert for the hero section",
      });
    }

    const isVisible = toBoolean(is_visible);
    let parsedConfig = safeJsonParse(config) ?? buildDefaultConfig(section_key);

    if (section_key === "flash_banner") {
      const { height, width, fontSize, viewMode } = parsedConfig;
      const normViewMode = VALID_VIEW_MODES.includes(viewMode)
        ? viewMode
        : "home";
      parsedConfig = {
        height: toCssLength(height, {
          minPx: 50,
          maxPx: 180,
          fallbackPx: 72,
          defaultUnit: "rem",
        }),
        width: toCssValue(width, 60, 100, 100, "%"),
        fontSize: toCssLength(fontSize, {
          minPx: 14,
          maxPx: 40,
          fallbackPx: 22,
          defaultUnit: "rem",
        }),
        viewMode: normViewMode,
      };
    } else if (section_key === "discount") {
      parsedConfig = {};
    } else if (section_key === "brands") {
      parsedConfig = sanitizeBrandConfig(parsedConfig);
    }

    const [section, created] = await ShopSection.findOrCreate({
      where: { seller_id: sellerId, section_key },
      defaults: { is_visible: isVisible, config: parsedConfig },
    });

    if (!created) {
      await section.update({ is_visible: isVisible, config: parsedConfig });
    }

    return res.json({
      success: true,
      section: {
        id: section.id,
        section_key: section.section_key,
        is_visible: section.is_visible,
        config: section.config,
      },
    });
  } catch (err) {
    console.error("upsertSection error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error saving section" });
  }
}

async function getBrandsSection(req, res) {
  try {
    const { id: sellerId } = req.user;
    const [section] = await ShopSection.findOrCreate({
      where: { seller_id: sellerId, section_key: "brands" },
      defaults: {
        is_visible: false,
        config: buildDefaultConfig("brands"),
      },
    });

    return res.json({
      success: true,
      section: {
        id: section.id,
        section_key: "brands",
        is_visible: section.is_visible,
        config: {
          ...buildDefaultConfig("brands"),
          ...(section.config || {}),
        },
      },
    });
  } catch (err) {
    console.error("getBrandsSection error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching brands section" });
  }
}

async function upsertBrandsSection(req, res) {
  try {
    const { id: sellerId } = req.user;
    const files = req.files || [];
    const { is_visible, config, new_logos_meta, delete_keys } = req.body;

    const parsedConfig = sanitizeBrandConfig(config);
    const newLogosMeta = safeJsonParse(new_logos_meta) || [];
    const keysToDelete = safeJsonParse(delete_keys) || [];

    if (files.length !== newLogosMeta.length) {
      return res.status(400).json({
        success: false,
        message: "Mismatch between uploaded logos and new_logos_meta entries",
      });
    }

    const itemsById = new Map(parsedConfig.items.map((item) => [item.id, item]));

    for (let i = 0; i < newLogosMeta.length; i++) {
      const meta = newLogosMeta[i];
      if (!meta?.itemId || !itemsById.has(meta.itemId)) {
        return res.status(400).json({
          success: false,
          message: `new_logos_meta[${i}] must reference a valid brand item id`,
        });
      }
    }

    for (const key of keysToDelete) {
      if (typeof key === "string" && key.trim() && !key.startsWith("http")) {
        deleteFromR2(key).catch((e) =>
          console.error("R2 brand logo delete failed:", key, e.message),
        );
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { itemId } = newLogosMeta[i];
      const item = itemsById.get(itemId);
      const key = `shops/${sellerId}/brands/${uuidv4()}.webp`;

      try {
        await uploadToR2(file.buffer, key, {
          width: 512,
          height: 512,
          fit: "inside",
          qualities: [82, 74, 66, 58],
          maxOutputBytes: 160 * 1024,
        });
        item.logo = key;
      } catch (uploadErr) {
        console.error("Brand logo upload failed:", uploadErr);
        return res.status(500).json({
          success: false,
          message: "Failed to upload one or more brand logos. Please try again.",
        });
      }
    }

    const isVisible = toBoolean(is_visible);
    const [section, created] = await ShopSection.findOrCreate({
      where: { seller_id: sellerId, section_key: "brands" },
      defaults: { is_visible: isVisible, config: parsedConfig },
    });

    if (!created) {
      await section.update({ is_visible: isVisible, config: parsedConfig });
    }

    return res.json({
      success: true,
      section: {
        id: section.id,
        section_key: "brands",
        is_visible: section.is_visible,
        config: section.config,
      },
    });
  } catch (err) {
    console.error("upsertBrandsSection error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.status ? err.message : "Server error saving brands section",
    });
  }
}

// ─── Controller: Upsert hero section (multipart/form-data) ────────────────────
//
// FormData fields:
//   is_visible        "true" | "false"
//   items_json        JSON array — the COMPLETE ordered list of items (source of truth).
//                     Each item: { id, images: { ku: "r2-key|null", ar: "r2-key|null" }, link }
//                     Items with null image slots that have new uploads will be filled below.
//   new_images        File[] — the actual image files
//   new_images_meta   JSON array matching new_images 1-to-1:
//                     [{ itemId: "uuid", lang: "ku"|"ar" }]
//   delete_keys       JSON array of R2 keys to delete
//
async function upsertHeroSection(req, res) {
  try {
    const { id: sellerId } = req.user;
    const files = req.files || [];
    const { is_visible, items_json, new_images_meta, delete_keys } = req.body;

    const items = safeJsonParse(items_json) || [];
    const newImagesMeta = safeJsonParse(new_images_meta) || [];
    const keysToDelete = safeJsonParse(delete_keys) || [];

    // ── Validate item count ────────────────────────────────────────────────────
    if (items.length > MAX_HERO_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `Hero section supports a maximum of ${MAX_HERO_ITEMS} items`,
      });
    }

    if (files.length !== newImagesMeta.length) {
      return res.status(400).json({
        success: false,
        message: "Mismatch between uploaded files and new_images_meta entries",
      });
    }

    // ── Validate and sanitize items ────────────────────────────────────────────
    for (const item of items) {
      if (!item.id || typeof item.id !== "string" || !item.id.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "Each item must have a valid id" });
      }
      if (!item.images || typeof item.images !== "object") {
        item.images = { ku: null, ar: null };
      }
      item.images.ku =
        typeof item.images.ku === "string" && item.images.ku.trim()
          ? item.images.ku.trim()
          : null;
      item.images.ar =
        typeof item.images.ar === "string" && item.images.ar.trim()
          ? item.images.ar.trim()
          : null;
      item.link = typeof item.link === "string" ? item.link.trim() : "";
      if (!isValidOptionalUrl(item.link)) {
        return res.status(400).json({
          success: false,
          message: `Invalid link for item "${item.id}". Must start with http:// or https://, or be empty.`,
        });
      }
    }

    // ── Validate new image meta ────────────────────────────────────────────────
    for (let i = 0; i < newImagesMeta.length; i++) {
      const meta = newImagesMeta[i];
      if (!meta.itemId || !["ku", "ar"].includes(meta.lang)) {
        return res.status(400).json({
          success: false,
          message: `new_images_meta[${i}] must have itemId and lang ("ku"|"ar")`,
        });
      }
    }

    // ── Delete removed R2 keys (fire-and-forget) ───────────────────────────────
    for (const key of keysToDelete) {
      if (typeof key === "string" && key.trim() && !key.startsWith("http")) {
        deleteFromR2(key).catch((e) =>
          console.error("R2 delete failed:", key, e.message),
        );
      }
    }

    // ── Build items map for fast lookup ────────────────────────────────────────
    const itemsMap = new Map();
    for (const item of items) {
      itemsMap.set(item.id, item);
    }

    // ── Upload new images and assign to correct item.images[lang] ─────────────
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { itemId, lang } = newImagesMeta[i];

      const item = itemsMap.get(itemId);
      if (!item) {
        // Item was declared in meta but not in items_json — skip
        continue;
      }

      const safeLang = lang === "ar" ? "ar" : "ku";
      const key = `shops/${sellerId}/hero/${safeLang}/${uuidv4()}.webp`;
      try {
        await uploadToR2(file.buffer, key, {
          width: 1920,
          height: 840,
          qualities: [84, 78, 72, 66],
          maxOutputBytes: 1200 * 1024,
        });
        item.images[lang] = key;
      } catch (uploadErr) {
        console.error("Hero image upload failed:", uploadErr);
        return res.status(500).json({
          success: false,
          message: "Failed to upload one or more images. Please try again.",
        });
      }
    }

    // ── Rebuild ordered items from the original array (preserving order) ───────
    const finalItems = items.map((item) => ({
      id: item.id,
      images: { ku: item.images.ku, ar: item.images.ar },
      link: item.link,
    }));

    const isVisible = toBoolean(is_visible);

    const [section, created] = await ShopSection.findOrCreate({
      where: { seller_id: sellerId, section_key: "hero" },
      defaults: { is_visible: isVisible, config: { items: finalItems } },
    });

    if (!created) {
      await section.update({
        is_visible: isVisible,
        config: { items: finalItems },
      });
    }

    return res.json({
      success: true,
      section: {
        id: section.id,
        section_key: "hero",
        is_visible: section.is_visible,
        config: section.config,
      },
    });
  } catch (err) {
    console.error("upsertHeroSection error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error saving hero section" });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/sections", jwtVerifySellerToken, getAllSections);
router.get("/sections/:key", jwtVerifySellerToken, getSection);
router.post("/sections/upsert", jwtVerifySellerToken, upsertSection);
router.get("/shop-sections/brands", jwtVerifySellerToken, getBrandsSection);
router.put(
  "/shop-sections/brands",
  jwtVerifySellerToken,
  brandUploadMiddleware,
  upsertBrandsSection,
);
router.post(
  "/sections/hero/upsert",
  jwtVerifySellerToken,
  heroUploadMiddleware,
  upsertHeroSection,
);

export default router;
