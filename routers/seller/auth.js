import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/seller.js";
import crypto from "crypto";
import { sellerToken, shortSellerToken } from "../../utils/addingToken.js";
import { checkMe } from "../../middlewares/jwtVerify.js";
import axios from "axios";
const router = express.Router();
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// Temporary in-memory store (use Redis in production)
const pkceStore = {};

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
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const seller = req.user;

    // Create short-lived temp token
    const tempToken = shortSellerToken(seller.id, { info: seller.name }, res);

    const frontend = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

    // Redirect the same tab directly to frontend OAuthSuccess
    res.redirect(
      `${frontend}/oauth-success?token=${tempToken}&provider=google`,
    );
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
  passport.authenticate("facebook", { scope: [] }), // removed "email" scope
);

// Callback
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

    // email may exist if seller added it manually after first login
    if (!seller.email) {
      token = shortSellerToken(seller.id, seller.name, res);
    } else {
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
    res.clearCookie("s_t", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

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
