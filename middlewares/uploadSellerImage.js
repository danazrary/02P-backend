import { uploadSellers } from "../utils/uploadHandler.js";

// Use the centralized upload middleware that handles environment-based storage
// In development (NODE_ENV=development): saves to backend/uploads/sellers
// In production (NODE_ENV=production): saves to VPS_UPLOAD_PATH/sellers
export const uploadSellerImage = uploadSellers;
