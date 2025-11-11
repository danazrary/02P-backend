import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../../utils/passportConfig.js";

const router = express.Router();

// routes/auth.js (example)
router.get("/google/url", (req, res) => {
  console.log("google/url");
  // If using passport, construct the URL using passport or manually:
  const url = `${process.env.PASSPORT_GOOGLE_AUTH_URL || "api/seller/auth/google"}`;
  // simpler: redirect endpoint still preferred; but you can return URL
  res.json({ url: `${req.protocol}://${req.get("host")}/api/seller/auth/google` });
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
    const token = jwt.sign(
      { id: seller.id, email: seller.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send token + user info to frontend
    res.json({
      success: true,
      message: "Login successful",
      token,
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
      },
    });
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
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const seller = req.user;
    const token = jwt.sign(
      { id: seller.id, email: seller.email },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Post message to opener window (for popup login)
    const payload = JSON.stringify({
      token,
      seller: { id: seller.id, name: seller.name, email: seller.email },
    });
    res.send(`
      <html><body>
      <script>
        if (window.opener) {
          window.opener.postMessage(${payload}, "*");
          window.close();
        } else {
          window.location = "/";
        }
      </script>
      </body></html>
    `);
  }
);



export default router;
