// backend/routes/seller/auth.js
import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/sellerv2.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from "resend";
import {
  sellerToken,
  shortSellerToken,
  clearCookieOpts,
} from "../../utils/addingToken.js";
import { checkMe } from "../../middlewares/jwtVerify.js";
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
  if (!req.session) return;
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
  return errors;
}

async function sendVerificationEmail(email, code, language = "ku") {
  try {
    await resendClient.emails.send({
      from: "Dwkanlink <no-reply@dwkanlink.com>",
      to: [email],
      subject: "کۆدی پشتڕاستکردنەوە | Dwkanlink",
      html: `<div style="font-family: Arial; direction: rtl; text-align: right;">
        <h2>کۆدی پشتڕاستکردنەوە</h2>
        <p style="font-size: 24px; font-weight: bold; color: #5d5fef;">${code}</p>
        <p>ئەم کۆدە تەنها بۆ ماوەی ١٠ خولەک کار دەکات.</p>
      </div>`,
    });
  } catch (err) {
    console.error("Email send error:", err);
  }
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const pkceStore = {};

function isProfileIncomplete(seller) {
  if (!seller) return true;
  if (!seller.shop_name) return true;
  if (
    seller.shop_name.startsWith("dwkan-") ||
    seller.shop_name.startsWith("shop-")
  ) {
    return true;
  }
  if (!seller.phone) return true;
  return false;
}

// ==========================================
// 1) REGISTER
// ==========================================
router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword, lang = "ku" } = req.body;

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

    const existing = await Seller.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = generate6DigitCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    const seller = await Seller.create({
      email: email.trim().toLowerCase(),
      password_hash: hashedPassword,
      email_verified: false,
      verification_code: code,
      code_expires: expires,
      name: email.split("@")[0],
      shop_name: `dwkan-${Date.now().toString().slice(-6)}`,
      business_type: "retail",
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

// ==========================================
// 2) LOGIN
// ==========================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const seller = await Seller.findOne({
      where: { email: email.trim().toLowerCase() },
    });
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

    if (seller.deletion_requested_at) {
      await seller.update({ deletion_requested_at: null });
    }

    sellerToken(seller.id, seller.email, seller.shop_name, res);
    return res.json({
      success: true,
      message: "Login successful",
      seller: {
        id: seller.id,
        shop_name: seller.shop_name,
        business_type: seller.business_type,
      },
    });
  } catch (err) {
    console.error("/login error", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================
// 3) VERIFY OTP CODE
// ==========================================
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code, purpose = "register" } = req.body;
    const seller = await Seller.findOne({
      where: { email: email.trim().toLowerCase() },
    });

    if (!seller || seller.verification_code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    if (new Date() > new Date(seller.code_expires)) {
      return res.status(400).json({ success: false, message: "Code expired" });
    }

    const updates = { verification_code: null, code_expires: null };
    if (purpose === "register") {
      updates.email_verified = true;
      if (seller.deletion_requested_at) {
        updates.deletion_requested_at = null;
      }
    }
    await seller.update(updates);

    if (purpose === "register") {
      sellerToken(seller.id, seller.email, seller.shop_name, res);
      return res.json({
        success: true,
        message: "Email verified",
        sellerId: seller.id,
        needsProfile: isProfileIncomplete(seller),
      });
    }

    if (purpose === "forgot-password") {
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

// ==========================================
// 4) FORGOT PASSWORD
// ==========================================
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, lang = "ku" } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email required" });

    const seller = await Seller.findOne({
      where: { email: email.trim().toLowerCase() },
    });
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

// ==========================================
// 5) RESET PASSWORD
// ==========================================
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

    const seller = await Seller.findOne({
      where: { email: email.trim().toLowerCase() },
    });
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

// ==========================================
// 6) CHANGE PASSWORD (SETTINGS)
// ==========================================
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

    const sellerId = req.user?.data?.id || req.user?.id;
    const seller = await Seller.findByPk(sellerId);
    if (!seller)
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });

    const match = await bcrypt.compare(oldPassword, seller.password_hash || "");
    if (!match)
      return res
        .status(401)
        .json({ success: false, message: "Old password is incorrect" });

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

// ==========================================
// 7) CHECK-ME
// ==========================================
router.get("/check-me", checkMe, async (req, res) => {
  const { user } = req;
  if (user.role === "seller") {
    const seller = await Seller.findByPk(user.data.id, {
      attributes: [
        "id",
        "shop_name",
        "business_type",
        "name",
        "email",
        "phone",
      ],
    });

    if (!seller) {
      return res.status(401).json({ error: true, logout: true });
    }

    const needsProfile = isProfileIncomplete(seller);

    return res.json({
      role: "seller",
      needsProfile,
      seller: {
        id: seller.id,
        shop_name: needsProfile ? null : seller.shop_name,
        business_type: seller.business_type,
        name: seller.name,
        email: seller.email,
      },
    });
  }
  return res.json({ role: user.role });
});

// ==========================================
// 8) COMPLETE PROFILE
// ==========================================
router.post("/complete-profile", checkMe, async (req, res) => {
  try {
    const sellerId = req.user.data.id;
    const { shop_name, business_type, phone, name, city } = req.body;

    if (!shop_name || !business_type) {
      return res.status(400).json({
        success: false,
        message: "ناوی فرۆشگا و جۆری کارکردن پێویستە",
      });
    }

    const cleanShopName = shop_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    const existing = await Seller.findOne({
      where: { shop_name: cleanShopName },
    });

    if (existing && existing.id !== sellerId) {
      return res
        .status(409)
        .json({ success: false, message: "ئەم ناوی فرۆشگایە پێشتر گیراوە" });
    }

    const seller = await Seller.findByPk(sellerId);
    await seller.update({
      shop_name: cleanShopName,
      business_type,
      phone: phone || seller.phone,
      name: name || seller.name,
      city: city || seller.city,
      needsManualEmail: false,
    });

    sellerToken(seller.id, seller.email || seller.name, seller.shop_name, res);

    return res.json({
      success: true,
      message: "پرۆفایل بە سەرکەوتوویی تەواو کرا",
      shop_name: seller.shop_name,
      business_type: seller.business_type,
    });
  } catch (err) {
    console.error("Complete Profile Error:", err);
    return res.status(500).json({ success: false, message: "هەڵەی سێرڤەر" });
  }
});

// ==========================================
// 9) GOOGLE OAUTH
// ==========================================
router.get("/google/url", (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/google`,
  });
});

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], state: true }),
);

router.get(
  "/google/callback",
  (req, res, next) => {
    const code = req.query.code;
    const redirectUrl = getStoredOAuthRedirect(req, "google", code);
    if (redirectUrl) return res.redirect(redirectUrl);
    next();
  },
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const seller = req.user;
    const tempToken = shortSellerToken(seller.id, { info: seller.name }, res);
    const redirectUrl = `${getFrontendOrigin(req)}/oauth-success?token=${tempToken}&provider=google`;

    storeOAuthRedirect(req, "google", req.query.code, redirectUrl);
    if (req.session) {
      req.session.save(() => res.redirect(redirectUrl));
      return;
    }
    res.redirect(redirectUrl);
  },
);

// ==========================================
// 10) FACEBOOK OAUTH
// ==========================================
router.get("/facebook/url", (req, res) => {
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/facebook`,
  });
});

router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: [], state: true }),
);

router.get(
  "/facebook/callback",
  (req, res, next) => {
    const code = req.query.code;
    const redirectUrl = getStoredOAuthRedirect(req, "facebook", code);
    if (redirectUrl) return res.redirect(redirectUrl);
    if (req.query.error === "access_denied") {
      return res.redirect(`${getFrontendOrigin(req)}/login`);
    }
    next();
  },
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const seller = req.user;
    let token;
    if (!seller.email) {
      token = shortSellerToken(seller.id, seller.name, res);
    } else {
      token = sellerToken(seller.id, seller.email, seller.shop_name, res);
    }

    const redirectUrl = `${getFrontendOrigin(req)}/oauth-success?token=${token}&provider=facebook`;
    storeOAuthRedirect(req, "facebook", req.query.code, redirectUrl);

    if (req.session) {
      req.session.save(() => res.redirect(redirectUrl));
      return;
    }
    res.redirect(redirectUrl);
  },
);

// ==========================================
// 11) TIKTOK OAUTH
// ==========================================
router.get("/tiktok/url", (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectURI = encodeURIComponent(
    `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`,
  );
  const scope = "user.info.basic";

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  pkceStore[state] = { codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 };

  const url = `https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&response_type=code&scope=${scope}&redirect_uri=${redirectURI}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  res.json({ url });
});

router.get("/tiktok/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const pkceData = pkceStore[state];
    if (!pkceData || Date.now() > pkceData.expiresAt) {
      return res.redirect(
        `${getFrontendOrigin(req)}/login?error=tiktok_invalid_state`,
      );
    }
    const { codeVerifier } = pkceData;
    delete pkceStore[state];

    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`,
        code_verifier: codeVerifier,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token, open_id } = tokenRes.data;
    const userRes = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { fields: "open_id,display_name,avatar_url" },
      },
    );

    const tiktokUser = userRes.data.data.user;

    let seller = await Seller.findOne({
      where: { tiktokId: tiktokUser.open_id },
    });
    if (!seller) {
      seller = await Seller.create({
        tiktokId: tiktokUser.open_id,
        name: tiktokUser.display_name || "TikTok Seller",
        shop_name: `shop-${Date.now().toString().slice(-6)}`,
        business_type: "social_media",
        needsManualEmail: true,
        email_verified: true,
      });
    }

    const tempToken = shortSellerToken(seller.id, { info: seller.name }, res);
    return res.redirect(
      `${getFrontendOrigin(req)}/oauth-success?token=${tempToken}&provider=tiktok`,
    );
  } catch (err) {
    console.error("TikTok Login Error:", err.response?.data || err.message);
    return res.redirect(
      `${getFrontendOrigin(req)}/login?error=tiktok_login_failed`,
    );
  }
});

// ==========================================
// 12) SUCCESS LOGIN (OAUTH)
// ==========================================
router.post("/successLogin", async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const tempToken = header.split(" ")[1];
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const seller = await Seller.findByPk(decoded.id);

    if (!seller) return res.status(404).json({ error: "Seller not found" });

    sellerToken(seller.id, seller.email || seller.name, seller.shop_name, res);

    const newSeller = isProfileIncomplete(seller);

    return res.json({
      success: true,
      id: seller.id,
      name: seller.name,
      email: seller.email,
      shop_name: newSeller ? null : seller.shop_name,
      business_type: seller.business_type,
      newSeller,
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// ==========================================
// 13) LOGOUT
// ==========================================
router.post("/logout", (req, res) => {
  res.clearCookie("s_t", clearCookieOpts());
  return res
    .status(200)
    .json({ success: true, message: "Logged out successfully" });
});

// ==========================================
// 14) STAFF LOGIN
// ==========================================
router.post("/staf33f/logi33n", async (req, res) => {
  try {
    const { shop_name, email, password } = req.body;
    if (!shop_name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    }

    const seller = await Seller.findOne({
      where: { shop_name: shop_name.trim().toLowerCase() },
    });

    if (!seller || seller.is_active === false) {
      return res
        .status(404)
        .json({ success: false, message: "Shop not found or inactive" });
    }

    const staffList = Array.isArray(seller.staff_members)
      ? seller.staff_members
      : typeof seller.staff_members === "string"
        ? JSON.parse(seller.staff_members || "[]")
        : [];

    const staffMember = staffList.find(
      (stf) =>
        stf.email?.trim().toLowerCase() === email.trim().toLowerCase() &&
        stf.is_active !== false,
    );

    if (!staffMember || !staffMember.password_hash) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, staffMember.password_hash);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const payload = {
      role: "staff",
      staff_role: staffMember.role || "cashier",
      staff_id: staffMember.staff_id,
      staff_name: staffMember.name,
      email: staffMember.email,
      seller_id: seller.id,
      parent_seller_id: seller.id,
      shop_name: seller.shop_name,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "dwkanlink_secret_key",
      {
        expiresIn: "30d",
      },
    );

    res.cookie("s_t", token, {
      ...clearCookieOpts(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      // Role info — save to localStorage as:
      //   localStorage.setItem("role", "staff")
      //   localStorage.setItem("isStaff", JSON.stringify(data.isStaff))
      isStaff: {
        role: staffMember.role, // "admin" | "product_manager" | "shop_editor" | "cashier"
        name: staffMember.name,
        staff_id: staffMember.staff_id,
      },
      staff: {
        staff_id: staffMember.staff_id,
        name: staffMember.name,
        email: staffMember.email,
        role: staffMember.role,
      },
      shop: {
        id: seller.id,
        shop_name: seller.shop_name,
        business_type: seller.business_type,
      },
    });
  } catch (err) {
    console.error("/staff/login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
