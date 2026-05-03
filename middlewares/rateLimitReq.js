import rateLimit from "express-rate-limit";

export const adminAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  // FIXME : change max to 500
  max: 15, // Limit each IP to 5 requests per windowMs
  message: {
    error: true,
    errorMsg: "Too many requests, please try again after 10 minutes",
  },
});
export const userAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50, // Limit each IP to 5 requests per windowMs
  message: {
    error: true,
    errorMsg: "کیشەێک ڕوویدا تکایە دواتر هەوڵبدەوە",
  },
});
export const sellerAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    error: true,
    errorMsg: "کیشەێک ڕوویدا تکایە دواتر هەوڵبدەوە",
  },
});

/**
 * Upload-specific rate limiter: 10 upload requests per minute per user.
 * Keyed on JWT user ID (set by jwtVerifySellerToken) with IP as fallback.
 * Must be applied AFTER the JWT middleware.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 4,
  keyGenerator: (req) => (req.user?.id ? String(req.user.id) : req.ip),
  message: {
    success: false,
    error: true,
    errorMsg:
      "Too many upload requests. Please wait a minute before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
