import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";
import Seller from "../../database/seller.js";
import crypto from "crypto";
import { sellerToken, shortSellerToken } from "../../utils/addingToken.js";
const router = express.Router();

// routes/auth.js (example)
router.get("/google/url", (req, res) => {
  console.log("google/url");
  // If using passport, construct the URL using passport or manually:
  const url = `${
    process.env.PASSPORT_GOOGLE_AUTH_URL || "api/seller/auth/google"
  }`;
  // simpler: redirect endpoint still preferred; but you can return URL
  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/google`,
  });
});

// 1️⃣ Start Google login/register
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// 2️⃣ Callback (Google redirect)
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    console.log("google/callback");

    const seller = req.user;

    // Create JWT
    const token = sellerToken(seller.id, seller.email, res);
    // Send token + user info to frontend
    /* res.json({
      success: true,
      message: "Login successful",
      token,
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
      },
    }); */
    const payload = {
      token,
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone,
        needsManualEmail: seller.needsManualEmail,
      },
    };

    const frontendOrigin =
      process.env.FRONTEND_ORIGIN || "http://localhost:5173";

    const nonce = crypto.randomBytes(16).toString("base64");
    res.setHeader(
      "Content-Security-Policy",
      `script-src 'self' 'nonce-${nonce}'`
    );

    res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script nonce="${nonce}">
            const payload = ${JSON.stringify(payload)};
            if (window.opener) {
              window.opener.postMessage(payload, "${frontendOrigin}");
            }
            window.close();
          </script>
        </body>
      </html>
    `);
  }
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
  passport.authenticate("facebook", { scope: ["email"] })
);

// Callback
// Backend callback - FIXED VERSION

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const seller = req.user;
    let token;
    if (!seller.email) {
      token = shortSellerToken(seller.id, { info: seller.name }, res);
    } else {
      token = sellerToken(seller.id, { info: seller.name }, res);
    }

    // Get frontend URL from query params
    const frontendUrl =
      req.query.origin ||
      process.env.FRONTEND_ORIGIN ||
      "http://localhost:5173";

    // Redirect to frontend with token
    const redirectUrl = `${frontendUrl}/oauth-success?token=${token}&id=${
      seller.id
    }&name=${encodeURIComponent(seller.name)}`;

    res.redirect(redirectUrl);
  }
);

router.post("/successLogin", async (req, res) => {
  console.log("success");

  try {
    // 1) get temporary token from frontend
    const header = req.headers.authorization;
    console.log("header", header);

    if (!header) {
      return res.status(401).json({ error: "No token provided" });
    }

    const tempToken = header.split(" ")[1];

    // 2) verify the temporary token (4-min token)
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);

    // 3) read seller id FROM the token
    const sellerId = decoded.id;

    // 4) fetch seller from database
    const seller = await Seller.findByPk(sellerId);

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }
    let sellerEmail = seller.email;
    if (!sellerEmail) {
      sellerEmail = seller.name;
    }
    const token = sellerToken(seller.id, sellerEmail, res);
    let newSeller;
    if (
      seller.needsManualEmail === true ||
      !seller.email ||
      !seller.phone ||
      !seller.name ||
      !seller.shop_name
    ) {
      newSeller = true;
    } else {
      newSeller = false;
    }
    // 5) create new long-lived token (7 days)

    // 7) send data back
    if (seller.email) {


      res.json({
        id: seller.id,
        name: seller.name,
        email: seller.email,
        shop_name: newSeller === false ? seller.shop_name : null,
        token,
        newSeller,
      });
    } else if (!seller.email) {
      res.json({
        id: seller.id,
        name: seller.name,
        email: null,
        token,
        newSeller,
      });
    }
  } catch (err) {
    console.log("SuccessLogin error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
