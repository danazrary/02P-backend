import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Check if running in production environment
 * @returns {boolean}
 */
export function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * Get the base upload directory based on environment
 * @param {string} subfolder - Optional subfolder (e.g., 'products', 'offers', 'sellers')
 * @returns {string} - Full path to upload directory
 */
export function getUploadDir(subfolder = "") {
  const baseDir = isProduction()
    ? process.env.VPS_UPLOAD_PATH || "/var/www/uploads"
    : path.join(process.cwd(), "uploads");

  const fullDir = subfolder ? path.join(baseDir, subfolder) : baseDir;

  // Ensure directory exists
  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }

  return fullDir;
}

/**
 * Get the relative URL path for an uploaded image
 * @param {string} subfolder - Subfolder name (e.g., 'products', 'offers', 'sellers')
 * @param {string} filename - The filename of the uploaded file
 * @returns {string} - Relative URL path
 */
export function getImageUrlPath(subfolder, filename) {
  // Always use /uploads as the URL path since that's how the frontend requests it
  return `/uploads/${subfolder}/${filename}`;
}
/**
 * Get the full absolute path of an image for file operations
 * @param {string} relativePath - Relative path like '/uploads/products/image.jpg'
 * @returns {string} - Absolute file path
 */
export function getImageAbsolutePath(relativePath) {
  if (!relativePath) return null;

  // Remove leading slash if present
  const cleanPath = relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;

  if (isProduction()) {
    const vpsBasePath = process.env.VPS_UPLOAD_PATH || "/var/www/uploads";
    // Remove 'uploads/' prefix if present since VPS_UPLOAD_PATH already points to uploads
    const pathWithoutUploads = cleanPath.replace(/^uploads\//, "");
    return path.join(vpsBasePath, pathWithoutUploads);
  }

  return path.join(process.cwd(), cleanPath);
}

/**
 * Create a multer upload middleware for a specific subfolder
 * @param {string} subfolder - Subfolder name (e.g., 'products', 'offers', 'sellers')
 * @param {object} options - Additional multer options
 * @returns {multer.Multer} - Configured multer instance
 */
export function createUploadMiddleware(subfolder, options = {}) {
  const uploadDir = getUploadDir(subfolder);

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const prefix = options.filenamePrefix || file.fieldname;
      cb(null, `${prefix}-${uniqueSuffix}${ext}`);
    },
  });

  const fileFilter =
    options.fileFilter ||
    ((req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only images allowed"), false);
      }
    });

  return multer({
    storage,
    fileFilter,
    limits: options.limits || { fileSize: 10 * 1024 * 1024 }, // 10MB default
  });
}

/**
 * Delete an image file based on its relative path
 * @param {string} relativePath - Relative path like '/uploads/products/image.jpg'
 * @returns {boolean} - True if deleted, false otherwise
 */
export function deleteImage(relativePath) {
  if (!relativePath) return false;

  try {
    const absolutePath = getImageAbsolutePath(relativePath);
    if (absolutePath && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
  } catch (err) {
    console.error("Error deleting image:", err);
  }
  return false;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use createUploadMiddleware instead
 */
export function setupUploadHandler() {
  return createUploadMiddleware("");
}

/**
 * Convert uploaded image(s) to WebP format
 * Works as Express middleware after multer - processes req.file or req.files
 * @param {Object} options - Conversion options
 * @param {number} options.quality - WebP quality 1-100 (default: 82)
 * @returns {Function} Express middleware
 */
export function convertToWebp(options = {}) {
  const { quality = 82 } = options;

  return async (req, res, next) => {
    try {
      const files = [];
      if (req.file) files.push(req.file);
      if (req.files && Array.isArray(req.files)) files.push(...req.files);

      if (files.length === 0) return next();

      for (const file of files) {
        const originalPath = file.path;
        const webpFilename = file.filename.replace(/\.[^/.]+$/, "") + ".webp";
        const webpPath = path.join(path.dirname(originalPath), webpFilename);

        await sharp(originalPath).webp({ quality }).toFile(webpPath);

        // Remove original file
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }

        // Update file info to reflect the new WebP file
        file.filename = webpFilename;
        file.path = webpPath;
        file.mimetype = "image/webp";
      }

      next();
    } catch (err) {
      console.error("WebP conversion error:", err);
      // Continue even if conversion fails - original files still exist
      next();
    }
  };
}

// Pre-configured upload middlewares for common use cases
export const uploadProducts = createUploadMiddleware("products", {
  filenamePrefix: "product",
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadOffers = createUploadMiddleware("offers", {
  filenamePrefix: "offer",
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadSellers = createUploadMiddleware("sellers", {
  filenamePrefix: "seller",
  limits: { fileSize: 2 * 1024 * 1024 },
});
