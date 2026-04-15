import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5000, // Allow 500 requests per IP
  message: {
    error: true,
    errorMsg: "داواکاری زۆر لەم ئایپیەوە، تکایە دواتر هەوڵبدەرەوە",
  },
  standardHeaders: true, // Adds RateLimit-Limit and RateLimit-Remaining headers
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers
});
export const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 4,
});

const devOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
  "http://192.168.1.17:5173",
  "https://192.168.1.17:5173",
];

const prodOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : [];

/**
 * Dynamic CORS origin checker that supports wildcard subdomains.
 * Allows: *.dwkanlink.com in production, plus dev origins in development.
 */
function corsOriginCheck(origin, callback) {
  // Allow requests with no origin (mobile apps, server-to-server, etc.)
  if (!origin) return callback(null, true);

  const allAllowed =
    process.env.NODE_ENV === "production"
      ? prodOrigins
      : [...devOrigins, ...prodOrigins];

  // Check exact match first
  if (allAllowed.includes(origin)) {
    return callback(null, true);
  }

  // Check wildcard subdomain match: https://*.dwkanlink.com
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const subdomainPattern = new RegExp(
    `^https?://[a-zA-Z0-9_-]+\\.${baseDomain.replace(/\./g, "\\.")}$`,
  );
  if (subdomainPattern.test(origin)) {
    return callback(null, true);
  }

  callback(new Error("Not allowed by CORS"));
}

export const corsOptions = {
  origin: corsOriginCheck,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const solt = bcrypt.genSaltSync(10); //if you use genSalt you need to use async and await
//you can change the 10 to more but it take more time
export function hashPassword(password) {
  //for register

  return bcrypt.hashSync(password, solt); //if you use hash you need to use async and await
}

export function comparePassword(password, hash) {
  //for login
  return bcrypt.compareSync(password, hash);
}

export function generateVerificationCode() {
  function generateVerificationCode(length = 6) {
    const digits = "0123456789";
    let code = "";
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * 10)];
    }
    return code;
  }

  const verificationCode = generateVerificationCode();
  const verificationCodeExpiresAt = new Date(Date.now() + 60 * 1000 * 3); //    3 minutes

  return { verificationCode, verificationCodeExpiresAt };
}
