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

// ── Concurrency control for sharp (max 4 parallel compressions) ────────────
const MAX_CONCURRENT_SHARP = 4;
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
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB raw upload ceiling
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024; // 1 MB post-compression ceiling
const THUMB_MAX_OUTPUT_BYTES = 120 * 1024;

const DEFAULT_UPLOAD_OPTIONS = {
  width: 1280,
  height: 1280,
  fit: "inside",
  withoutEnlargement: true,
  background: undefined,
  qualities: [80, 75, 70],
  maxOutputBytes: MAX_OUTPUT_BYTES,
  webpEffort: 6,
};

// ── Color image constants ──────────────────────────────────────────────────
const COLOR_IMAGE_MAX_BYTES = 180 * 1024; // 180 KB hard cap
const COLOR_IMAGE_PASS1 = { width: 1000, height: 1000, quality: 68 };
const COLOR_IMAGE_PASS2 = { width: 850, height: 850, quality: 55 };

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
 * Mandatory compression pipeline for the main image.
 * Resizes to ≤ 1280×1280 and converts to WebP.
 * Tries qualities [80, 75, 70] until output ≤ 1 MB.
 * Throws if even quality-70 exceeds the limit.
 *
 * @param {Buffer} buffer
 * @param {Object} options
 * @returns {Promise<Buffer>} WebP buffer
 */
async function _compressImage(buffer, options = {}) {
  const config = { ...DEFAULT_UPLOAD_OPTIONS, ...options };
  const qualities = Array.isArray(config.qualities)
    ? config.qualities
    : DEFAULT_UPLOAD_OPTIONS.qualities;

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

    const result = await sharp(buffer)
      .resize(resizeOptions)
      .webp({ quality, effort: config.webpEffort })
      .toBuffer();

    if (result.length <= config.maxOutputBytes) {
      return result;
    }

    if (quality === qualities[qualities.length - 1]) {
      throw new Error(
        `Image cannot be compressed below ${(config.maxOutputBytes / 1024 / 1024).toFixed(0)} MB (size at quality=${quality}: ${(result.length / 1024 / 1024).toFixed(2)} MB). Use a smaller source image.`,
      );
    }
    console.warn(
      `⚠️  R2 compress q=${quality}: ${(result.length / 1024).toFixed(0)} KB > ${(config.maxOutputBytes / 1024).toFixed(0)} KB — retrying lower quality`,
    );
  }
}

/**
 * Thumbnail compression pipeline.
 * Resizes to ≤ 300×300, quality 60. Thumbnails are always small enough.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>} WebP thumbnail buffer
 */
async function _compressThumb(buffer) {
  const qualities = [60, 55, 50, 45, 40];

  for (const quality of qualities) {
    const thumbBuffer = await sharp(buffer)
      .resize({
        width: 300,
        height: 300,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 6 })
      .toBuffer();

    if (thumbBuffer.length <= THUMB_MAX_OUTPUT_BYTES) {
      return thumbBuffer;
    }
  }

  return sharp(buffer)
    .resize({
      width: 300,
      height: 300,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 40, effort: 6 })
    .toBuffer();
}

/**
 * Strict compression pipeline for per-color images.
 * Target: 20–120 KB.  Hard cap: 180 KB.
 *
 * Pass 1: resize ≤ 1000×1000, WebP q=68, effort=6, smartSubsample.
 * Pass 2 (if still > 180 KB): resize ≤ 850×850, WebP q=55.
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
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();

  const resizedMeta = await sharp(pass1).metadata();
  console.log(
    `🎨 [ColorImg] original ${origW}×${origH} (${(buffer.length / 1024).toFixed(1)} KB) → ` +
      `resized ${resizedMeta.width}×${resizedMeta.height} → pass1 ${(pass1.length / 1024).toFixed(1)} KB (q=${COLOR_IMAGE_PASS1.quality})`,
  );

  if (pass1.length <= COLOR_IMAGE_MAX_BYTES) {
    return pass1;
  }

  // Pass 2: re-compress harder
  console.warn(
    `⚠️  [ColorImg] pass1 ${(pass1.length / 1024).toFixed(1)} KB > 180 KB — re-compressing with q=${COLOR_IMAGE_PASS2.quality} @ ${COLOR_IMAGE_PASS2.width}px`,
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
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();

  console.log(
    `🎨 [ColorImg] pass2 final: ${(pass2.length / 1024).toFixed(1)} KB (q=${COLOR_IMAGE_PASS2.quality})`,
  );
  return pass2;
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

  // ── Concurrency-limited compression ─────────────────────────────────────
  await _acquireSharp();
  let webpBuffer;
  try {
    webpBuffer = await _compressImage(buffer, options);
  } finally {
    _releaseSharp();
  }

  const finalKb = (webpBuffer.length / 1024).toFixed(1);
  console.log(
    `☁️  [${isLocalEnv ? "LOCAL" : "VPS"}] Uploading: ${key} | raw ${originalKb} KB → webp ${finalKb} KB`,
  );

  // ── R2 upload ─────────────────────────────────────────────────────────────
  try {
    await _putToR2(webpBuffer, key);
  } catch (err) {
    console.error(`❌ R2 upload failed [${key}]:`, err.message);
    throw new Error(`R2 upload failed: ${err.message}`);
  }

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
      `uploadToR2WithThumb: file (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds 25 MB raw upload limit`,
    );
  }

  const id = uuidv4();
  const mainKey = `${basePath}/main/${id}.webp`;
  const thumbKey = `${basePath}/thumb/${id}.webp`;

  // ── Concurrency-limited compression (both variants in one slot) ──────────
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

  console.log(
    `☁️  [${isLocalEnv ? "LOCAL" : "VPS"}] Uploading main+thumb: ${basePath} | main ${(mainBuffer.length / 1024).toFixed(1)} KB | thumb ${(thumbBuffer.length / 1024).toFixed(1)} KB`,
  );

  // ── Upload both keys in parallel ─────────────────────────────────────────
  try {
    await Promise.all([
      _putToR2(mainBuffer, mainKey),
      _putToR2(thumbBuffer, thumbKey),
    ]);
  } catch (err) {
    console.error(`❌ R2 dual upload failed [${basePath}]:`, err.message);
    throw new Error(`R2 upload failed: ${err.message}`);
  }

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
