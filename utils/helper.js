import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // Allow 500 requests per IP
  message: {
    error: true,
    errorMsg: "داواکاری زۆر لەم ئایپیەوە، تکایە دواتر هەوڵبدەرەوە",
  },
  standardHeaders: true, // Adds RateLimit-Limit and RateLimit-Remaining headers
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers
});

export const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.1.17:5173",
  ],
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
