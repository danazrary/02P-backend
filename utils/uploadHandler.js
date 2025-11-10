import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

export function setupUploadHandler() {
  const env = process.env.ENVIRONMENT;

  // Define base upload directory depending on environment
  const uploadDir =
    env === "product"
      ? process.env.VPS_UPLOAD_PATH || "/var/www/uploads"
      : process.env.LOCAL_UPLOAD_PATH || path.join(process.cwd(), "uploads");

  // Ensure directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Multer storage configuration
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
  });

  const upload = multer({ storage });
  return upload;
}
