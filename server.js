//......
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import hpp from "hpp";
import http from "http";
import https from "https";
import path from "path";
import fs from "fs";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import "./utils/passportConfig.js";
// Routers, Middleware, Utils
import allRouters from "./routers/index.js";
import csrfMiddleware from "./middlewares/csrf.js";
import { sanitizeHtmlMiddleware } from "./middlewares/sanitizeHtml.js";
import { verifyCsrfToken } from "./utils/csrfProtection.js";
import { apiLimiter, corsOptions } from "./utils/helper.js";
import { adminToken, adminRefreshToken } from "./utils/addingToken.js";
import { sequelize } from "./database/index.js";
import { scheduleCleanup } from "./utils/cleanupExpired.js";

// Load environment variables based on mode
// Check if --env=https argument is passed
const isHttpsMode = process.argv.includes("--env=https");
const envFile = isHttpsMode ? ".env.https" : ".env";
dotenv.config({ path: envFile });
console.log(`🔧 Loading environment from: ${envFile}`);

// --- CREATE EXPRESS APP ---
const app = express();

// Request logging - Only in development
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log("🔥 INCOMING:", req.method, req.url);
    next();
  });
}

app.set("trust proxy", 1);
app.use(passport.initialize());
//app.use("/uploads", express.static("uploads"));

// place BEFORE server start (near end of app file, but after routers)

// --- MIDDLEWARE ---
/* app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "";
  if (origin) res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-CSRF-Token"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}); */

// Serve static uploads based on environment
// In development: serve from backend/uploads
// In production: serve from VPS_UPLOAD_PATH (e.g., /var/www/uploads)
const uploadsPath =
  process.env.NODE_ENV === "production"
    ? process.env.VPS_UPLOAD_PATH || "/var/www/uploads"
    : path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsPath));

app.use(cors(corsOptions));

app.use("/", apiLimiter); // Apply to all routes
app.use("/api", apiLimiter); // Extra protection for API routes
app.use(helmet());
app.use(hpp());
app.use(bodyParser.json({ limit: process.env.BODY_LIMIT || "10mb" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: process.env.BODY_LIMIT || "10mb",
  }),
);
if (typeof sanitizeHtmlMiddleware === "function")
  app.use(sanitizeHtmlMiddleware);
app.use(cookieParser(process.env.COOKIE_SECRET_PARSER || ""));
app.use(csrfMiddleware);

// --- ROUTERS ---
app.use("/api", allRouters);

app.get("/profile", (req, res) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user });
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
});

// CSRF Token endpoint
app.get("/csrf-token", (req, res) => {
  if (!res.locals || !res.locals.csrfToken)
    return res.status(500).json({ error: "CSRF token not available" });
  res.json({ csrfToken: res.locals.csrfToken });
});

// CSRF Protected route example
app.post("/protected", (req, res) => {
  const csrfToken = req.body.csrfToken || req.headers["x-csrf-token"];
  const csrfSecret = req.cookies && req.cookies.csrfSecret;
  if (!csrfToken || !csrfSecret)
    return res.status(403).send("CSRF token or secret missing");

  const isValidToken = verifyCsrfToken(csrfSecret, csrfToken);
  if (!isValidToken) return res.status(403).send("Invalid CSRF token");
  res.send("CSRF token validated");
});

// Token test routes
app.post("/test", async (req, res) => {
  try {
    const token = adminToken("dana@gmail.com", "0000000", res);
    adminRefreshToken("dana@gmail.com", "0000000", res);
    res.cookie("a_ta", token, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      sameSite: "lax",
    });
    res.send("adda");
  } catch (err) {
    console.error(err);
    res.status(500).send("Token error");
  }
});

app.get("/test", (req, res) => res.send("Check your console for cookies."));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- ERROR HANDLERS ---
// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// Global error handler - must be last
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);

  // Don't leak error details in production
  const errorResponse = {
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  };

  res.status(err.status || 500).json(errorResponse);
});

// --- DATABASE INITIALIZATION ---
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    if (process.env.NODE_ENV === "production") {
      console.error("Cannot start server without database connection");
      process.exit(1);
    }
    return false;
  }
}

// --- SERVER CONFIG ---
const port = Number(process.env.PORT || 3001);
const mode = process.env.ENVIRONMENT?.trim() || "product";
const bindHost = process.env.BIND_HOST || "0.0.0.0";

// --- SERVER START FUNCTIONS ---
function startHttpsServer() {
  try {
    const privateKey = fs.readFileSync(process.env.HTTPS_KEY_PATH, "utf8");
    const certificate = fs.readFileSync(process.env.HTTPS_CERT_PATH, "utf8");
    const credentials = { key: privateKey, cert: certificate };

    https.createServer(credentials, app).listen(port, bindHost, () => {
      console.log(
        `🔒 HTTPS server running on https://${bindHost}:${port} (mode=${mode})`,
      );
      scheduleCleanup(); // Start cleanup scheduler
    });
  } catch (err) {
    console.error("❌ Failed to start HTTPS server:", err);
    process.exit(1);
  }
}

function startHttpServer() {
  http.createServer(app).listen(port, bindHost, () => {
    console.log(
      `🚀 HTTP server running on http://${bindHost}:${port} (mode=${mode})`,
    );
    scheduleCleanup(); // Start cleanup scheduler
  });
}

// --- START SERVER ---
async function startServer() {
  // Initialize database first
  await initializeDatabase();

  // Start appropriate server based on mode
  if (mode === "product" || mode === "developingURL") {
    startHttpsServer();
  } else {
    startHttpServer();
  }
}

// Start the server
startServer().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});

// --- CLEAN SHUTDOWN ---
process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT — shutting down server...");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM — shutting down server...");
  process.exit(0);
});

export default app;
