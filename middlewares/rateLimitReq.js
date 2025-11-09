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
  max: 50, // Limit each IP to 5 requests per windowMs
  message: {
    error: true,
    errorMsg: "کیشەێک ڕوویدا تکایە دواتر هەوڵبدەوە",
  },
});