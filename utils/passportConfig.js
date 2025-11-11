import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import seller from "../database/seller.js";
import { Strategy as FacebookStrategy } from "passport-facebook";
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3001/api/seller/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("google passcong");

        const email = profile.emails[0].value;
        const name = profile.displayName;
        const googleId = profile.id;

        let sellerExist = await seller.findOne({ where: { email } });

        if (!sellerExist) {
          sellerExist = await seller.create({
            googleId,
            name,
            email,
          });
        }

        return done(null, sellerExist);
      } catch (err) {
        console.log("error-------------------------------------------------------------------------------------------------", err);
        return done(err, null);
      }
    }
  )
);
// facebook strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_CLIENT_ID,
      clientSecret: process.env.FB_CLIENT_SECRET,
      callbackURL: "http://localhost:3001/api/seller/auth/facebook/callback",
      profileFields: ["id", "displayName", "emails"], // request email
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("facebook passport");

        const facebookId = profile.id;
        const name = profile.displayName;
        const email = profile.emails?.[0]?.value;

        let sellerExist = await seller.findOne({ where: { facebookId } });

        if (!sellerExist) {
          sellerExist = await seller.create({
            facebookId,
            name,
            email,
          });
        }

        return done(null, sellerExist);
      } catch (err) {
        console.log("Facebook error:", err);
        return done(err, null);
      }
    }
  )
);

