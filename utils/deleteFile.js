import fs from "fs";
import path from "path";

/**
 * Check if running in production environment
 * @returns {boolean}
 */
function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * Get the full absolute path of an image for file operations
 * @param {string} relativePath - Relative path like '/uploads/products/image.jpg'
 * @returns {string} - Absolute file path
 */
function getAbsolutePath(relativePath) {
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
 * Delete a file based on its relative path
 * Handles both development (local) and production (VPS) environments
 * @param {string} filePath - Relative path like '/uploads/products/image.jpg'
 * @returns {boolean} - True if deleted, false otherwise
 */
export function deleteFile(filePath) {
  if (!filePath) return false;

  try {
    const absolutePath = getAbsolutePath(filePath);

    if (absolutePath && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
  } catch (err) {
    console.error("Error deleting file:", err);
  }
  return false;
}
