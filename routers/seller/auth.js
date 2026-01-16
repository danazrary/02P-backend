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

router.get("/check-me", checkMe, async (req, res) => {
  const { user } = req;
  console.log(user);
  if (user.role === "customer") {
    return res.json({ role: "customer" });
  } else if (user.role === "seller") {
const findSeller = await Seller.findByPk(user.data.id,{
  attributes: ['shop_name', "id"]
}); 
console.log(findSeller);

    return res.json({ role: "seller", seller: findSeller });
  } else if (user.role === "admin") {

    return res.json({ role: "admin" });
  }
});

router.get("/google/url", (req, res) => {
  console.log("google/url");

  res.json({
    url: `${req.protocol}://${req.get("host")}/api/seller/auth/google`,
  });
});

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
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
      `${frontend}/oauth-success?token=${tempToken}&provider=google`
    );
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
      token = shortSellerToken(seller.id, { info: seller.name }, res);
    } else {
      token = sellerToken(seller.id, { info: seller.name }, res);
    }

    const frontendUrl =
      req.query.origin ||
      process.env.FRONTEND_ORIGIN ||
      "http://localhost:5173";

   res.redirect(
     `${frontendUrl}/oauth-success?token=${token}&provider=facebook`
   );

  }
);


router.get("/tiktok/url", (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectURI = encodeURIComponent(
    `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`
  );
  const scope = "user.info.basic";

  const url = `https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;

  res.json({ url });
});



router.get("/tiktok/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectURI = `${process.env.BACKEND_URL}/api/seller/auth/tiktok/callback`;

    // Exchange code for access token
    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/access_token/",
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectURI,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, open_id } = tokenRes.data.data;

    // Fetch user profile
    const userRes = await axios.get(
      `https://open-api.tiktok.com/user/info/?access_token=${access_token}&open_id=${open_id}`
    );

    const tiktokUser = userRes.data.data;

    // Now create or fetch seller in your DB
    let sellerExist = await Seller.findOne({
      where: { tiktokId: tiktokUser.open_id },
    });

    if (!sellerExist) {
      sellerExist = await Seller.create({
        tiktokId: tiktokUser.open_id,
        name: tiktokUser.display_name,
        email: null,
      });
    }

    const tempToken = shortSellerToken(
      sellerExist.id,
      { info: sellerExist.name },
      res
    );
    const frontend = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

    res.redirect(
      `${frontend}/oauth-success?token=${tempToken}&provider=tiktok`
    );
  } catch (err) {
    console.error("TikTok login error:", err);
    res.redirect(
      `${process.env.FRONTEND_ORIGIN}/login?error=tiktok_login_failed`
    );
  }
});


router.post("/successLogin", async (req, res) => {
  console.log("success");

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
    sellerToken(seller.id, sellerEmail, res); // sets cookie: s_t

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
    console.log("SuccessLogin error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
