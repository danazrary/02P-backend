/**
 * Cloudflare R2 storage utility (S3-compatible via AWS SDK v3)
 *
 * Required env vars:
 *   R2_ACCOUNT_ID       - Cloudflare account ID
 *   R2_ACCESS_KEY_ID    - R2 access key
 *   R2_SECRET_ACCESS_KEY - R2 secret key
 *   R2_BUCKET_NAME      - Bucket name
 *   R2_PUBLIC_URL       - Public base URL (e.g. https://images.yourdomain.com)
 *
 * ENVIRONMENT var:
 *   developeLH  → running locally (localhost)
 *   product     → running on VPS (production)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

// ── Environment detection ───────────────────────────────────────────────────
const ENV = process.env.ENVIRONMENT?.trim() || "product";
export const isLocalEnv = ENV === "developeLH";
export const isProductionEnv = ENV === "product";

console.log(
  `📦 R2 storage initialised — environment: ${ENV} (${isLocalEnv ? "localhost" : "VPS"})`,
);
// ───────────────────────────────────────────────────────────────────────────

// Apply a global concurrency cap so Sharp never thrashes the CPU
sharp.concurrency(2);

// ── Concurrency control for sharp (max 2 parallel requests) ─────────────────
const MAX_CONCURRENT_SHARP = 2;
let _sharpActive = 0;
const _sharpQueue = [];

function _acquireSharp() {
  return new Promise((resolve) => {
    if (_sharpActive < MAX_CONCURRENT_SHARP) {
      _sharpActive++;
      resolve();
    } else {
      _sharpQueue.push(resolve);
    }
  });
}

function _releaseSharp() {
  _sharpActive--;
  if (_sharpQueue.length > 0) {
    _sharpActive++;
    _sharpQueue.shift()();
  }
}
// ─────────────────────────────────────────────────────────────────────────

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB raw input guard before compression
const R2_HARD_CEILING_BYTES = 500 * 1024; // 500 KB absolute ceiling — nothing larger enters R2

// Main product image targets: ≤1400×1400, quality 68→62→56, max 350 KB
const MAIN_MAX_DIM = 1400;
const MAIN_MAX_OUTPUT_BYTES = 350 * 1024;
const MAIN_QUALITIES = [68, 62, 56];

// Thumbnail targets: ≤300×300, quality 50→42→36, max 60 KB
const THUMB_MAX_DIM = 300;
const THUMB_MAX_OUTPUT_BYTES = 60 * 1024;
const THUMB_QUALITIES = [50, 42, 36];

// Color image targets: ≤900×900, quality 60→50→42, max 180 KB
const COLOR_IMAGE_MAX_BYTES = 180 * 1024;
const COLOR_IMAGE_PASS1 = { width: 900, height: 900, quality: 60 };
const COLOR_IMAGE_PASS2 = { width: 750, height: 750, quality: 48 };
const COLOR_IMAGE_PASS3 = { width: 600, height: 600, quality: 40 };

// Legacy constant (kept so existing callers of buildR2Key/uploadToR2 still work)
const MAX_OUTPUT_BYTES = MAIN_MAX_OUTPUT_BYTES;

const DEFAULT_UPLOAD_OPTIONS = {
  width: MAIN_MAX_DIM,
  height: MAIN_MAX_DIM,
  fit: "inside",
  withoutEnlargement: true,
  background: undefined,
  qualities: MAIN_QUALITIES,
  maxOutputBytes: MAIN_MAX_OUTPUT_BYTES,
  webpEffort: 4, // effort 4 is faster than 6 with negligible quality loss
};

/**
 * Build a structured R2 key for an image.
 * @param {"products"|"offers"|"branding"} type
 * @param {number|string} sellerId
 * @param {number|string|null} resourceId - productId or offerId (null for branding)
 * @param {string} filename
 * @returns {string}
 */
export function buildR2Key(type, sellerId, resourceId, filename) {
  if (type === "branding") {
    return `shops/${sellerId}/branding/${filename}`;
  }
  return `shops/${sellerId}/${type}/${resourceId}/${filename}`;
}

/**
 * Mandatory compression pipeline for the main product image.
 * Resizes to ≤ MAIN_MAX_DIM×MAIN_MAX_DIM, converts to WebP.
 * Adaptive: tries MAIN_QUALITIES until output ≤ MAIN_MAX_OUTPUT_BYTES.
 * Absolute ceiling: rejects any result above R2_HARD_CEILING_BYTES (500 KB).
 *
 * @param {Buffer} buffer
 * @param {Object} options
 * @returns {Promise<Buffer>} WebP buffer
 */
async function _compressImage(buffer, options = {}) {
  const config = { ...DEFAULT_UPLOAD_OPTIONS, ...options };
  const qualities = Array.isArray(config.qualities)
    ? config.qualities
    : MAIN_QUALITIES;

  let bestBuffer = null;

  for (const quality of qualities) {
    const resizeOptions = {
      width: config.width,
      height: config.height,
      fit: config.fit,
      withoutEnlargement: config.withoutEnlargement,
    };
    if (config.background) {
      resizeOptions.background = config.background;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await sharp(buffer)
      .resize(resizeOptions)
      .webp({ quality, effort: config.webpEffort })
      .toBuffer();

    bestBuffer = result;

    if (result.length <= config.maxOutputBytes) {
      return result;
    }

    console.warn(
      `⚠️  R2 compress q=${quality}: ${(result.length / 1024).toFixed(0)} KB > ${(config.maxOutputBytes / 1024).toFixed(0)} KB — retrying lower quality`,
    );
  }

  // bestBuffer is the result at the lowest quality
  if (bestBuffer && bestBuffer.length <= R2_HARD_CEILING_BYTES) {
    console.warn(
      `⚠️  R2 compress: could not reach target (${(MAIN_MAX_OUTPUT_BYTES / 1024).toFixed(0)} KB), ` +
        `but result (${(bestBuffer.length / 1024).toFixed(0)} KB) is within the 500 KB hard cap — accepting.`,
    );
    return bestBuffer;
  }

  throw new Error(
    `Image cannot be compressed below 500 KB after all quality passes. ` +
      `Final size: ${bestBuffer ? (bestBuffer.length / 1024).toFixed(0) + " KB" : "unknown"}. ` +
      `Use a smaller or simpler source image.`,
  );
}

/**
 * Thumbnail compression pipeline.
 * Resizes to ≤ 300×300. Adaptive quality until output ≤ 60 KB.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>} WebP thumbnail buffer
 */
async function _compressThumb(buffer) {
  for (const quality of THUMB_QUALITIES) {
    // eslint-disable-next-line no-await-in-loop
    const thumbBuffer = await sharp(buffer)
      .resize({
        width: THUMB_MAX_DIM,
        height: THUMB_MAX_DIM,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    if (thumbBuffer.length <= THUMB_MAX_OUTPUT_BYTES) {
      return thumbBuffer;
    }
  }

  // Fallback: lowest quality defined
  return sharp(buffer)
    .resize({
      width: THUMB_MAX_DIM,
      height: THUMB_MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITIES[THUMB_QUALITIES.length - 1], effort: 4 })
    .toBuffer();
}

/**
 * Strict compression pipeline for per-color images.
 * Target: 60–180 KB. Hard cap: 180 KB. Absolute ceiling: 500 KB.
 *
 * Pass 1: resize ≤ 900×900, WebP q=60, effort=4.
 * Pass 2 (if > 180 KB): resize ≤ 750×750, WebP q=48.
 * Pass 3 (if still > 180 KB): resize ≤ 600×600, WebP q=40.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function _compressColorImage(buffer) {
  const metadata = await sharp(buffer).metadata();
  const origW = metadata.width || 0;
  const origH = metadata.height || 0;

  // Pass 1
  const pass1 = await sharp(buffer)
    .resize({
      width: COLOR_IMAGE_PASS1.width,
      height: COLOR_IMAGE_PASS1.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: COLOR_IMAGE_PASS1.quality,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  console.log(
    `🎨 [ColorImg] original ${origW}×${origH} (${(buffer.length / 1024).toFixed(1)} KB) → ` +
      `pass1 ${(pass1.length / 1024).toFixed(1)} KB (q=${COLOR_IMAGE_PASS1.quality})`,
  );

  if (pass1.length <= COLOR_IMAGE_MAX_BYTES) return pass1;

  // Pass 2
  console.warn(
    `⚠️  [ColorImg] pass1 ${(pass1.length / 1024).toFixed(1)} KB > 180 KB — pass2 q=${COLOR_IMAGE_PASS2.quality} @ ${COLOR_IMAGE_PASS2.width}px`,
  );
  const pass2 = await sharp(buffer)
    .resize({
      width: COLOR_IMAGE_PASS2.width,
      height: COLOR_IMAGE_PASS2.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: COLOR_IMAGE_PASS2.quality,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  console.log(
    `🎨 [ColorImg] pass2 ${(pass2.length / 1024).toFixed(1)} KB (q=${COLOR_IMAGE_PASS2.quality})`,
  );

  if (pass2.length <= COLOR_IMAGE_MAX_BYTES) return pass2;

  // Pass 3
  console.warn(
    `⚠️  [ColorImg] pass2 still > 180 KB — pass3 q=${COLOR_IMAGE_PASS3.quality} @ ${COLOR_IMAGE_PASS3.width}px`,
  );
  const pass3 = await sharp(buffer)
    .resize({
      width: COLOR_IMAGE_PASS3.width,
      height: COLOR_IMAGE_PASS3.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: COLOR_IMAGE_PASS3.quality,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  console.log(
    `🎨 [ColorImg] pass3 final: ${(pass3.length / 1024).toFixed(1)} KB (q=${COLOR_IMAGE_PASS3.quality})`,
  );

  if (pass3.length > R2_HARD_CEILING_BYTES) {
    throw new Error(
      `Color image cannot be compressed below 500 KB. Final size: ${(pass3.length / 1024).toFixed(0)} KB.`,
    );
  }

  return pass3;
}

/**
 * Internal: put a pre-processed buffer to R2 with CDN cache headers.
 * @param {Buffer} buffer
 * @param {string} key
 */
async function _putToR2(buffer, key) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/**
 * Validate, compress (mandatory pipeline), and upload a buffer to R2.
 *
 * @param {Buffer} buffer - Raw file buffer from multer memoryStorage
 * @param {string} key    - Full R2 object key
 * @param {Object} options
 * @returns {Promise<{key: string, sizeBytes: number}>}
 */
export async function uploadToR2(buffer, key, options = {}) {
  // ── Defensive buffer validation ──────────────────────────────────────────
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("uploadToR2: invalid or empty buffer");
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error(
      `uploadToR2: file (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds 25 MB raw upload limit`,
    );
  }

  const originalKb = (buffer.length / 1024).toFixed(1);
  const t0 = Date.now();

  // ── Concurrency-limited compression ─────────────────────────────────────
  await _acquireSharp();
  let webpBuffer;
  try {
    webpBuffer = await _compressImage(buffer, options);
  } finally {
    _releaseSharp();
  }

  const compressMs = Date.now() - t0;
  const finalKb = (webpBuffer.length / 1024).toFixed(1);
  console.log(
    `☁️  [${isLocalEnv ? "LOCAL" : "VPS"}] Uploading: ${key} | raw ${originalKb} KB → webp ${finalKb} KB | compress ${compressMs}ms`,
  );

  // ── R2 upload ─────────────────────────────────────────────────────────────
  const t1 = Date.now();
  try {
    await _putToR2(webpBuffer, key);
  } catch (err) {
    console.error(`❌ R2 upload failed [${key}]:`, err.message);
    throw new Error(`R2 upload failed: ${err.message}`);
  }

  console.log(`[Upload] R2 PUT ${key} in ${Date.now() - t1}ms`);
  return { key, sizeBytes: webpBuffer.length };
}

/**
 * Compress a color image with the strict color pipeline and upload to R2.
 * Target: 20–120 KB.  Hard cap: 180 KB.
 * Uses upload-first, delete-old logic — callers are responsible for removing
 * the old key AFTER this function returns successfully.
 *
 * @param {Buffer} buffer - Raw file buffer from multer memoryStorage
 * @param {string} key    - Full R2 object key
 * @returns {Promise<{key: string, sizeBytes: number}>}
 */
export async function uploadColorImageToR2(buffer, key) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("uploadColorImageToR2: invalid or empty buffer");
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error(
      `uploadColorImageToR2: file (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds 25 MB raw upload limit`,
    );
  }

  await _acquireSharp();
  let webpBuffer;
  try {
    webpBuffer = await _compressColorImage(buffer);
  } finally {
    _releaseSharp();
  }

  console.log(
    `☁️  [${isLocalEnv ? "LOCAL" : "VPS"}] Uploading color image: ${key} | final ${(webpBuffer.length / 1024).toFixed(1)} KB`,
  );

  try {
    await _putToR2(webpBuffer, key);
  } catch (err) {
    console.error(`❌ R2 color upload failed [${key}]:`, err.message);
    throw new Error(`R2 upload failed: ${err.message}`);
  }

  return { key, sizeBytes: webpBuffer.length };
}

/**
 * Validate, compress, and upload BOTH a main (1280px q=80) and thumbnail
 * (300px q=60) version of an image to R2 in a single call.
 *
 * The two files share the same UUID and are stored at:
 *   {basePath}/main/{uuid}.webp
 *   {basePath}/thumb/{uuid}.webp
 *
 * @param {Buffer} buffer   - Raw file buffer from multer memoryStorage
 * @param {string} basePath - Key prefix, e.g. "shops/14/products/123"
 * @returns {Promise<{mainKey: string, thumbKey: string, sizeBytes: number, thumbSizeBytes: number, totalSizeBytes: number}>}
 */
export async function uploadToR2WithThumb(buffer, basePath) {
  // ── Defensive buffer validation ──────────────────────────────────────────
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("uploadToR2WithThumb: invalid or empty buffer");
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error(
      `uploadToR2WithThumb: file (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds ${(MAX_INPUT_BYTES / 1024 / 1024).toFixed(0)} MB raw upload limit`,
    );
  }

  const fileId = uuidv4();
  const mainKey = `${basePath}/main/${fileId}.webp`;
  const thumbKey = `${basePath}/thumb/${fileId}.webp`;

  // ── Concurrency-limited compression (both variants in one slot) ──────────
  const t0 = Date.now();
  await _acquireSharp();
  let mainBuffer, thumbBuffer;
  try {
    [mainBuffer, thumbBuffer] = await Promise.all([
      _compressImage(buffer),
      _compressThumb(buffer),
    ]);
  } finally {
    _releaseSharp();
  }
  const compressMs = Date.now() - t0;

  console.log(
    `☁️  [${isLocalEnv ? "LOCAL" : "VPS"}] main+thumb compress ${compressMs}ms | ` +
      `main ${(mainBuffer.length / 1024).toFixed(1)} KB | thumb ${(thumbBuffer.length / 1024).toFixed(1)} KB`,
  );

  // ── Upload both keys in parallel ─────────────────────────────────────────
  const t1 = Date.now();
  try {
    await Promise.all([
      _putToR2(mainBuffer, mainKey),
      _putToR2(thumbBuffer, thumbKey),
    ]);
  } catch (err) {
    console.error(`❌ R2 dual upload failed [${basePath}]:`, err.message);
    throw new Error(`R2 upload failed: ${err.message}`);
  }
  console.log(
    `[Upload] R2 PUT main+thumb for ${basePath} in ${Date.now() - t1}ms`,
  );

  return {
    mainKey,
    thumbKey,
    sizeBytes: mainBuffer.length,
    thumbSizeBytes: thumbBuffer.length,
    totalSizeBytes: mainBuffer.length + thumbBuffer.length,
  };
}

/**
 * Read the current object size in bytes for a single R2 key.
 * Returns 0 when the object is missing or cannot be read.
 * @param {string} key
 * @returns {Promise<number>}
 */
export async function getR2ObjectSize(key) {
  if (!key) return 0;

  try {
    const response = await r2Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );

    return Number(response.ContentLength || 0);
  } catch (err) {
    console.error("R2 head-object error:", err?.message || err);
    return 0;
  }
}

/**
 * Delete a single object from R2.
 * @param {string} key
 */
export async function deleteFromR2(key) {
  if (!key) return;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error("R2 delete error:", err);
  }
}

/**
 * Delete multiple objects from R2.
 * @param {string[]} keys
 */
export async function deleteMultipleFromR2(keys) {
  if (!keys || keys.length === 0) return;
  try {
    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: keys.map((k) => ({ Key: k })),
          Quiet: true,
        },
      }),
    );
  } catch (err) {
    console.error("R2 bulk delete error:", err);
  }
}

/**
 * Convert an R2 key to a public image URL.
 * @param {string|null} key
 * @returns {string|null}
 */
export function getR2Url(key) {
  if (!key) return null;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Multer memory-storage instance for R2 uploads.
 * Import and use as middleware: upload.array("images", 5)
 */
import multer from "multer";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

export function createR2Multer(options = {}) {
  const {
    fileSize = MAX_INPUT_BYTES,
    files = 20,
    allowedMime = ALLOWED_MIME,
  } = options;

  return multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
      if (!allowedMime.includes(file.mimetype)) {
        return cb(
          new Error(
            `File type "${file.mimetype}" is not allowed. Use JPEG, PNG, or WebP.`,
          ),
          false,
        );
      }
      cb(null, true);
    },
    limits: {
      fileSize,
      files,
    },
  });
}

export const r2Multer = createR2Multer();
