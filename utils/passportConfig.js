import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import FacebookStrategy from "passport-facebook";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../database/mySQL/users.js"; // Your Sequelize model
import dotenv from "dotenv";

dotenv.config();

// Generate JWT token
const generateToken = (userId, identifier, res) => {
  const token = jwt.sign({ userId, identifier }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

  // Set as HTTP-only cookie
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return token;
};

// Google Strategy
passport.use(
  new GoogleStrategy.Strategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ where: { email } });

        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email,
            provider: "google",
            provider_id: profile.id,
            profile_image_url: profile.photos[0].value,
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Facebook Strategy (with mobile support)
passport.use(
  new FacebookStrategy.Strategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/auth/facebook/callback",
      profileFields: ["id", "displayName", "emails", "photos", "phone"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let identifier = "";
        let userData = {
          name: profile.displayName,
          provider: "facebook",
          provider_id: profile.id,
          profile_image_url: profile.photos[0]?.value,
        };

        // Check for email or phone
        if (profile.emails && profile.emails[0]) {
          identifier = profile.emails[0].value;
          userData.email = identifier;
        } else if (profile.phone) {
          identifier = profile.phone;
          userData.mobile = identifier;
        } else {
          // Use Facebook ID as fallback
          identifier = `fb_${profile.id}`;
        }

        // Find or create user
        let user = await User.findOne({
          where: {
            [identifier.includes("@") ? "email" : "mobile"]: identifier,
          },
        });

        if (!user) {
          user = await User.create(userData);
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export { generateToken };
