import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import seller from "../database/seller.js";

import { Strategy as FacebookStrategy } from "passport-facebook";

const isHttpsMode = process.argv.includes("--env=https");
dotenv.config({ path: isHttpsMode ? ".env.https" : ".env" });

const BACKEND_BASE_URL = (process.env.BACKEND_URL || "http://localhost:3001").replace(
  /\/$/,
  "",
);

function getCallbackUrl(provider) {
  return `${BACKEND_BASE_URL}/api/seller/auth/${provider}/callback`;
}

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
          profile.displayName || profile.name?.givenName || email || "Google User";
        const googleId = profile.id;

        let sellerExist = await seller.findOne({ where: { googleId } });

        if (!sellerExist && email) {
          sellerExist = await seller.findOne({ where: { email } });
        }

        if (sellerExist && !sellerExist.googleId) {
          sellerExist.googleId = googleId;
          await sellerExist.save();
        }

        if (!sellerExist) {
          sellerExist = await seller.create({
            googleId,
            name,
            email,
            password_hash: null,
          });
        }

        return done(null, sellerExist);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

// facebook strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_CLIENT_ID,
      clientSecret: process.env.FB_CLIENT_SECRET,
      callbackURL: getCallbackUrl("facebook"),
      profileFields: ["id", "displayName"], // removed "emails"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const facebookId = profile.id;
        const name = profile.displayName;

        let sellerExist = await seller.findOne({ where: { facebookId } });

        if (!sellerExist) {
          sellerExist = await seller.create({
            facebookId,
            name,
            email: null,
            password_hash: null,
            needsManualEmail: true,
          });
        }

        return done(null, sellerExist);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);
/* passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_CLIENT_ID,
      clientSecret: process.env.FB_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL || "http://localhost:3001"}/api/seller/auth/facebook/callback`,
      profileFields: ["id", "displayName", "emails"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const facebookId = profile.id;
        const name = profile.displayName;
        const email = profile.emails?.[0]?.value || null;

        let sellerExist = await seller.findOne({ where: { facebookId } });

        if (!sellerExist) {
          if (email) {
            // normal login
            sellerExist = await seller.findOne({ where: { email } });
            if (sellerExist) {
              sellerExist.facebookId = facebookId;
              await sellerExist.save();
            } else {
              sellerExist = await seller.create({
                facebookId,
                name,
                email,
                needsManualEmail: false,
              });
            }
          } else {
            // Facebook has NO email
            sellerExist = await seller.create({
              facebookId,
              name,
              email: null,
              phone: null,
              needsManualEmail: true, // require email & phone manually after login
            });
          }
        }

        return done(null, sellerExist);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
); */
