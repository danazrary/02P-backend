import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/seller.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from "resend";
import {
  sellerToken,
  shortSellerToken,
  clearCookieOpts,
} from "../../utils/addingToken.js";
import { checkMe } from "../../middlewares/jwtVerify.js";
import { pingGoogleSitemap } from "../sitemap.js";
import axios from "axios";
const router = express.Router();

const resendClient = new Resend(process.env.RESEND_API_KEY || "");

const isProductionEnvironment =
  process.env.NODE_ENV === "production" ||
  process.env.ENVIRONMENT === "product";

function getFrontendOrigin(req) {
  if (isProductionEnvironment) {
    return process.env.FRONTEND_ORIGIN || "https://dwkanlink.com";
  }

  return (
    req.query.origin || process.env.FRONTEND_ORIGIN || "http://localhost:5173"
  );
}

function getStoredOAuthRedirect(req, provider, code) {
  const stored = req.session?.oauthCallbacks?.[provider];
  if (!stored || stored.code !== code) {
    return null;
  }

  return stored.redirectUrl || null;
}

function storeOAuthRedirect(req, provider, code, redirectUrl) {
  if (!req.session) {
    return;
  }

  req.session.oauthCallbacks = {
    ...(req.session.oauthCallbacks || {}),
    [provider]: {
      code,
      redirectUrl,
      finishedAt: Date.now(),
    },
  };
}

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getPasswordValidationErrors(password) {
  const errors = [];
  if (password.length < 8)
    errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password))
    errors.push("Password must include an uppercase letter");
  if (!/[a-z]/.test(password))
    errors.push("Password must include a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number");
  if (!/[!@#$%^&*(),.?\"{}|<>]/.test(password))
    errors.push("Password must include a special character");
  return errors;
}

function getEmailBodyTemplate(code, language) {
  const codeText = String(code);
  if (language === "ar") {
    return {
      subject: "رمز التحقق الخاص بك",
      html: `<div style="font-family: Arial, sans-serif;line-height:1.5;color:#1a1a1a;"><h2 style="color:#5D5FEF;">رمز التحقق</h2><p>رمز التحقق الخاص بك هو:</p><p style="font-size:2rem;font-weight:bold;color:#5D5FEF;">${codeText}</p><p>سيتم انتهاء هذا الرمز خلال 10 دقائق.</p></div>`,
    };
  }

  if (language === "ku") {
    return {
      subject: "کۆدی پشتڕاستکردنەوە",
      html: `<div style="font-family: Arial, sans-serif;line-height:1.5;color:#1a1a1a;"><h2 style="color:#5D5FEF;">کۆدی پشتڕاستکردنەوە</h2><p>کۆدی پشتڕاستکردنەوەی تۆ ئەمەیە:</p><p style="font-size:2rem;font-weight:bold;color:#5D5FEF;">${codeText}</p><p>ئەم کۆدە دەبێ تەنها 10 خولەک بەکارببرێ.</p></div>`,
    };
  }

  return {
    subject: "Your verification code",
    html: `<div style="font-family: Arial, sans-serif;line-height:1.5;color:#1a1a1a;"><h2 style="color:#5D5FEF;">Verification Code</h2><p>Your verification code is:</p><p style="font-size:2rem;font-weight:bold;color:#5D5FEF;">${codeText}</p><p>This code expires in 10 minutes.</p></div>`,
  };
}

async function sendVerificationEmail(email, code, language = "en") {
  const { subject, html } = getEmailBodyTemplate(code, language);
  await resendClient.emails.send({
    from: "Dwkanlink <no-reply@dwkanlink.com>",
    to: [email],
    subject,
    html,
  });
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// Temporary in-memory store (use Redis in production)
const pkceStore = {};

// --- 1) REGISTER ---
router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword, lang = "en" } = req.body;

    if (!email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const passwordErrors = getPasswordValidationErrors(password);
    if (passwordErrors.length) {
      return res
        .status(400)
        .json({ success: false, message: passwordErrors.join(", ") });
    }

    const existing = await Seller.findOne({ where: { email } });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = generate6DigitCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    const seller = await Seller.create({
      email,
      password_hash: hashedPassword,
      email_verified: false,
      verification_code: code,
      code_expires: expires,
      name: email.split("@")[0],
      shop_name: null,
    });

    await sendVerificationEmail(email, code, lang);

    return res.json({
      success: true,
      message: "Verification code sent",
      data: { email: seller.email },
    });
  } catch (err) {
    console.error("/register error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 2) LOGIN ---
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const seller = await Seller.findOne({ where: { email } });
    if (!seller || !seller.password_hash) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, seller.password_hash);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (!seller.email_verified) {
      return res
        .status(403)
        .json({ success: false, message: "Email not verified" });
    }

    // Cancel any pending deletion if seller logs back in
    if (seller.deletion_requested_at) {
      await seller.update({ deletion_requested_at: null });
    }

    const token = jwt.sign(
      { id: seller.id, email: seller.email, isSeller: true },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    sellerToken(seller.id, seller.email, seller.shop_name, res);

    return res.json({ success: true, token, message: "Login successful" });
  } catch (err) {
    console.error("/login error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 3) FORGOT PASSWORD ---
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, lang = "en" } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email required" });
    }

    const seller = await Seller.findOne({ where: { email } });
    if (!seller) {
      return res
        .status(200)
        .json({ success: true, message: "If account exists, code was sent" });
    }

    const code = generate6DigitCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await seller.update({ verification_code: code, code_expires: expires });
    await sendVerificationEmail(email, code, lang);

    return res.json({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error("/forgot-password error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 4) VERIFY CODE ---
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code, purpose = "register" } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ success: false, message: "Email and code required" });
    }

    const seller = await Seller.findOne({ where: { email } });
    if (!seller || !seller.verification_code || !seller.code_expires) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    if (seller.verification_code !== String(code).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid verification code" });
    }

    if (new Date() > new Date(seller.code_expires)) {
      return res.status(400).json({ success: false, message: "Code expired" });
    }

    const updates = { verification_code: null, code_expires: null };

    if (purpose === "register") {
      updates.email_verified = true;
      // Cancel any pending deletion if seller verifies email
      if (seller.deletion_requested_at) {
        updates.deletion_requested_at = null;
      }
    }

    await seller.update(updates);

    if (purpose === "register") {
      const token = jwt.sign(
        { id: seller.id, email: seller.email, isSeller: true },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );
      sellerToken(seller.id, seller.email, seller.shop_name, res);
      return res.json({ success: true, message: "Email verified", token });
    }

    if (purpose === "forgot-password") {
      // secure token for password reset 
      const resetToken = jwt.sign(
        { id: seller.id, email: seller.email, purpose: "reset-password" },
        process.env.JWT_SECRET,
        { expiresIn: "15m" },
      );
      return res.json({ success: true, message: "Code verified", resetToken });
    }

    return res.json({ success: true, message: "Code verified" });
  } catch (err) {
    console.error("/verify-code error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 5) RESET PASSWORD ---
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword, confirmPassword } = req.body;

    if (!email || !code || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const passwordErrors = getPasswordValidationErrors(newPassword);
    if (passwordErrors.length) {
      return res
        .status(400)
        .json({ success: false, message: passwordErrors.join(", ") });
    }

    const seller = await Seller.findOne({ where: { email } });
    if (!seller || !seller.verification_code || !seller.code_expires) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    if (seller.verification_code !== String(code).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid verification code" });
    }

    if (new Date() > new Date(seller.code_expires)) {
      return res.status(400).json({ success: false, message: "Code expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await seller.update({
      password_hash: hashedPassword,
      verification_code: null,
      code_expires: null,
      email_verified: true,
    });

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("/reset-password error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 6) CHANGE PASSWORD (settings) ---
router.post("/change-password", checkMe, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    const passwordErrors = getPasswordValidationErrors(newPassword);
    if (passwordErrors.length) {
      return res
        .status(400)
        .json({ success: false, message: passwordErrors.join(", ") });
    }

    const sellerId = req.user?.data?.id;
    if (!sellerId) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const seller = await Seller.findByPk(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    const match = await bcrypt.compare(oldPassword, seller.password_hash || "");
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Old password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await seller.update({ password_hash: hashedPassword });

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("/change-password error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/check-me", checkMe, async (req, res) => {
  const { user } = req;
  if (user.role === "customer") {
    return res.json({ role: "customer" });
  } else if (user.role === "seller") {
    const findSeller = await Seller.findByPk(user.data.id, {
      attributes: ["shop_name", "id"],
    });

    return res.json({ role: "seller", seller: findSeller });
  } else if (user.role === "admin") {
    return res.json({ role: "admin" });
  }
});

router.get("/google/url", (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/google`,
  });
});

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: true,
  }),
);

router.get(
  "/google/callback",
  (req, res, next) => {
    const code = req.query.code;
    const redirectUrl = getStoredOAuthRedirect(req, "google", code);

    if (redirectUrl) {
      return res.redirect(redirectUrl);
    }

    next();
  },
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const seller = req.user;

    // Create short-lived temp token
    const tempToken = shortSellerToken(seller.id, { info: seller.name }, res);

    const frontend = getFrontendOrigin(req);
    const redirectUrl = `${frontend}/oauth-success?token=${tempToken}&provider=google`;

    storeOAuthRedirect(req, "google", req.query.code, redirectUrl);

    // Redirect the same tab directly to frontend OAuthSuccess
    if (req.session) {
      req.session.save(() => {
        res.redirect(redirectUrl);
      });
      return;
    }

    res.redirect(redirectUrl);
  },
);

// Facebook routes
router.get("/facebook/url", (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/facebook`,
  });
});

// Start OAuth
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: [], state: true }), // removed "email" scope
);

// Callback
router.get(
  "/facebook/callback",

  // 1️⃣ Handle cancel FIRST
  (req, res, next) => {
    const code = req.query.code;
    const redirectUrl = getStoredOAuthRedirect(req, "facebook", code);

    if (redirectUrl) {
      return res.redirect(redirectUrl);
    }

    if (req.query.error === "access_denied") {
      const frontendUrl = getFrontendOrigin(req);

      return res.redirect(`${frontendUrl}/login`);
    }
    next();
  },

  // 2️⃣ Passport only runs if NOT cancelled
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "/login",
  }),

  // 3️⃣ Success
  (req, res) => {
    const seller = req.user;
    let token;

    // email may exist if seller added it manually after first login
    if (!seller.email) {
      token = shortSellerToken(seller.id, seller.name, res);
    } else {
      token = sellerToken(seller.id, seller.email, seller.shop_name, res);
    }

    const frontendUrl = getFrontendOrigin(req);
    const redirectUrl = `${frontendUrl}/oauth-success?token=${token}&provider=facebook`;

    storeOAuthRedirect(req, "facebook", req.query.code, redirectUrl);

    if (req.session) {
      req.session.save(() => {
        res.redirect(redirectUrl);
      });
      return;
    }

    res.redirect(redirectUrl);
  },
);
/* router.get("/facebook/url", (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/facebook`,
  });
});

// Start OAuth
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] }),
);

// Callback
// Backend callback - FIXED VERSION
//http://localhost:3000/api/seller/auth/facebook/callback
router.get(
  "/facebook/callback",

  // 1️⃣ Handle cancel FIRST
  (req, res, next) => {
    if (req.query.error === "access_denied") {
      const frontendUrl =
        req.query.origin ||
        process.env.FRONTEND_ORIGIN ||
        "http://localhost:5173";

      return res.redirect(`${frontendUrl}/login`);
    }
    next();
  },

  // 2️⃣ Passport only runs if NOT cancelled
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "/login",
  }),

  // 3️⃣ Success
  (req, res) => {
    const seller = req.user;
    let token;

    if (!seller.email) {
      // pass only plain string
      token = shortSellerToken(seller.id, seller.name, res);
    } else {
      // email must be a string, shop_name must be string
      token = sellerToken(seller.id, seller.email, seller.shop_name, res);
    }

    const frontendUrl =
      process.env.ENVIRONMENT === "product"
        ? "https://dwkanlink.com"
        : req.query.origin ||
          process.env.FRONTEND_ORIGIN ||
          "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/oauth-success?token=${token}&provider=facebook`,
    );
  },
); */

router.get("/tiktok/url", (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectURI = encodeURIComponent(
    `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`,
  );
  const scope = "user.info.basic";

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  // Store verifier keyed by state (expires in 10 min)
  pkceStore[state] = { codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 };

  const url =
    `https://www.tiktok.com/v2/auth/authorize?` +
    `client_key=${clientKey}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&redirect_uri=${redirectURI}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  res.json({ url });
});

router.get("/tiktok/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(
        `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_no_code`,
      );
    }

    // Retrieve and validate PKCE verifier
    const pkceData = pkceStore[state];
    if (!pkceData || Date.now() > pkceData.expiresAt) {
      return res.redirect(
        `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_invalid_state`,
      );
    }
    const { codeVerifier } = pkceData;
    delete pkceStore[state]; // one-time use

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectURI = `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`;

    // Exchange code for access token (include code_verifier)
    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectURI,
        code_verifier: codeVerifier, // 👈 This was missing
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    if (!tokenRes.data || !tokenRes.data.access_token) {
      console.error("TikTok token error:", tokenRes.data);
      return res.redirect(
        `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_login_failed`,
      );
    }

    const { access_token, open_id } = tokenRes.data;
    // ✅ Fix: use v2 user info endpoint (old one is deprecated)
    const userRes = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { fields: "open_id,display_name,avatar_url" },
      },
    );

    if (!userRes.data || !userRes.data.data) {
      console.error("TikTok user fetch error:", userRes.data);
      return res.redirect(
        `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_login_failed`,
      );
    }

    const tiktokUser = userRes.data.data.user;

    // Create or fetch seller in DB
    let sellerExist = await Seller.findOne({
      where: { tiktokId: tiktokUser.open_id },
    });
    if (!sellerExist) {
      sellerExist = await Seller.create({
        tiktokId: tiktokUser.open_id,
        name: tiktokUser.display_name || "TikTok User",
        email: null,
        password_hash: null,
        needsManualEmail: true,
      });
    }

    const tempToken = shortSellerToken(
      sellerExist.id,
      { info: sellerExist.name },
      res,
    );
    const frontend = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    res.redirect(
      `${frontend}/oauth-success?token=${tempToken}&provider=tiktok`,
    );
  } catch (err) {
    console.error("TikTok login error:", err.response?.data || err.message);
    res.redirect(
      `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_login_failed`,
    );
  }
});

router.post("/successLogin", async (req, res) => {
  try {
    // 1) get temporary token from Authorization header
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const tempToken = header.split(" ")[1];

    // 2) verify temporary token (short-lived)
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);

    // 3) read seller id from token
    const sellerId = decoded.id;

    // 4) fetch seller
    const seller = await Seller.findByPk(sellerId);

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    // Cancel any pending deletion if seller logs back in via OAuth
    if (seller.deletion_requested_at) {
      await seller.update({ deletion_requested_at: null });
    }

    // 5) create FINAL token → saved as httpOnly cookie (s_t)
    const sellerEmail = seller.email || seller.name;
    sellerToken(seller.id, sellerEmail, seller.shop_name, res); // sets cookie: s_t

    // 6) check if seller profile is incomplete
    const newSeller =
      seller.needsManualEmail === true ||
      !seller.email ||
      !seller.phone ||
      !seller.name ||
      !seller.shop_name;

    // 📌 Ping Google sitemap if new seller created
    if (newSeller) {
      console.log("sitemap req ");

      pingGoogleSitemap().catch((err) =>
        console.warn("⚠️ Sitemap ping warning:", err.message),
      );
    }

    // 7) respond WITHOUT sending token
    res.json({
      success: true,
      id: seller.id,
      name: seller.name,
      email: seller.email || null,
      shop_name: newSeller ? null : seller.shop_name,
      newSeller,
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});
//.
//.
//.
//.
// // Logout route

router.post("/logout", (req, res) => {
  try {
    // Clear auth cookies
    res.clearCookie("s_t", clearCookieOpts());

    return res.status(200).json({
      success: true,
      error: false,
      message: "Logged out successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: true,
      message: "Logout failed",
    });
  }
});

export default router;
