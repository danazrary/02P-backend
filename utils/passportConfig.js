// backend/utils/passportConfig.js
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import SellerV2 from "../database/sellerv2.js";

const isHttpsMode = process.argv.includes("--env=https");
dotenv.config({ path: isHttpsMode ? ".env.https" : ".env" });

const BACKEND_BASE_URL = (
  process.env.BACKEND_URL || "http://localhost:3001"
).replace(/\/$/, "");

function getCallbackUrl(provider) {
  return `${BACKEND_BASE_URL}/api/seller/auth/${provider}/callback`;
}

// ١. Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: getCallbackUrl("google"),
      state: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const name =
          profile.displayName ||
          profile.name?.givenName ||
          email ||
          "Google User";
        const googleId = profile.id;

        let seller = await SellerV2.findOne({ where: { googleId } });

        if (!seller && email) {
          seller = await SellerV2.findOne({ where: { email } });
        }

        if (seller && !seller.googleId) {
          seller.googleId = googleId;
          await seller.save();
        }

        if (!seller) {
          seller = await SellerV2.create({
            googleId,
            name,
            email,
            password_hash: null,
            email_verified: true,
            shop_name: `dwkan-${Date.now().toString().slice(-6)}`,
            business_type: "retail",
          });
        }

        return done(null, seller);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

// ٢. Facebook OAuth Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_CLIENT_ID,
      clientSecret: process.env.FB_CLIENT_SECRET,
      callbackURL: getCallbackUrl("facebook"),
      profileFields: ["id", "displayName"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const facebookId = profile.id;
        const name = profile.displayName || "Facebook User";

        let seller = await SellerV2.findOne({ where: { facebookId } });

        if (!seller) {
          seller = await SellerV2.create({
            facebookId,
            name,
            email: null,
            password_hash: null,
            needsManualEmail: true,
            email_verified: true,
            shop_name: `dwkan-${Date.now().toString().slice(-6)}`,
            business_type: "social_media",
          });
        }

        return done(null, seller);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);
