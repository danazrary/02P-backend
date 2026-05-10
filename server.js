//......
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
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
import sitemapRouter from "./routers/sitemap.js";
import csrfMiddleware from "./middlewares/csrf.js";
import { sanitizeHtmlMiddleware } from "./middlewares/sanitizeHtml.js";
import { verifyCsrfToken } from "./utils/csrfProtection.js";
import { apiLimiter, corsOptions } from "./utils/helper.js";
import { adminToken, adminRefreshToken } from "./utils/addingToken.js";
import { sequelize } from "./database/index.js";
import { scheduleCleanup } from "./utils/cleanupExpired.js";
import seoPrerender from "./middlewares/seoPrerender.js";

// Load environment variables based on mode
// Check if --env=https argument is passed
const isHttpsMode = process.argv.includes("--env=https");
const envFile = isHttpsMode ? ".env.https" : ".env";
dotenv.config({ path: envFile });
console.log(`🔧 Loading environment from: ${envFile}`);

// --- CREATE EXPRESS APP ---
const app = express();

const isProductionEnvironment =
  process.env.NODE_ENV === "production" ||
  process.env.ENVIRONMENT === "product";
const sessionBaseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
const sessionCookieOptions = {
  httpOnly: true,
  secure: isProductionEnvironment,
  sameSite: "lax",
  path: "/",
};

if (isProductionEnvironment) {
  sessionCookieOptions.domain = `.${sessionBaseDomain}`;
}

// Request logging - Only in development
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log("🔥 INCOMING:", req.method, req.url);
    next();
  });
}

app.set("trust proxy", 1);
app.use(
  session({
    name: process.env.SESSION_COOKIE_NAME || "dwkanlink.sid",
    secret:
      process.env.SESSION_SECRET ||
      process.env.COOKIE_SECRET_PARSER ||
      process.env.JWT_SECRET ||
      "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    rolling: false,
    cookie: {
      ...sessionCookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);
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

// Apply CORS before static file serving
app.use(cors(corsOptions));

// Serve static uploads based on environment
// In development: serve from backend/uploads
// In production: serve from VPS_UPLOAD_PATH (e.g., /var/www/uploads)
const uploadsPath =
  process.env.NODE_ENV === "production"
    ? process.env.VPS_UPLOAD_PATH || "/var/www/uploads"
    : path.join(process.cwd(), "uploads");
app.use(
  "/uploads",
  express.static(uploadsPath, {
    maxAge: "30d",
    immutable: true,
    etag: true,
  }),
);

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

// --- SUBDOMAIN DETECTION ---
// Extract shopName from subdomain (e.g. easy_store.dwkanlink.com → shopName = "easy_store")
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "static",
  "assets",
  "uploads",
  "mail",
  "ftp",
  "smtp",
  "support",
  "help",
  "blog",
  "news",
]);

app.use((req, res, next) => {
  const host = req.headers.host || "";
  const hostname = host.split(":")[0]; // remove port
  const parts = hostname.split(".");

  if (parts.length > 2 && !RESERVED_SUBDOMAINS.has(parts[0].toLowerCase())) {
    req.shopName = parts[0];
  } else {
    req.shopName = null;
  }

  next();
});

// --- OLD URL → SUBDOMAIN REDIRECT ---
// Redirect path-based shop URLs to subdomain format (301 permanent)
import { RESERVED_SHOP_NAMES } from "./utils/reservedShopNames.js";
const RESERVED_PATHS = new Set([
  ...RESERVED_SHOP_NAMES.map((n) => n.toLowerCase()),
  "api",
  "uploads",
  "static",
  "assets",
  "sitemap.xml",
  "robots.txt",
  "manifest.json",
  "favicon.ico",
  "sw.js",
  "health",
  "test",
  "csrf-token",
  "protected",
  "profile",
  "secure-control-panel",
]);

app.use((req, res, next) => {
  // Only redirect on the main domain (no subdomain present)
  if (req.shopName) return next();

  // Only redirect GET requests (not API calls)
  if (req.method !== "GET") return next();

  const host = req.headers.host || "";
  const hostname = host.split(":")[0];

  // Only apply on production domain
  if (!hostname.includes("dwkanlink.com")) return next();

  const pathParts = req.path.split("/").filter(Boolean);
  if (pathParts.length === 0) return next();

  const firstSegment = pathParts[0];

  // Don't redirect reserved paths
  if (RESERVED_PATHS.has(firstSegment.toLowerCase())) return next();

  // Don't redirect paths with file extensions (static assets)
  if (firstSegment.includes(".")) return next();

  // Redirect: /shopName/... → https://shopName.dwkanlink.com/...
  const remainingPath = pathParts.slice(1).join("/");
  const queryString = req.originalUrl.includes("?")
    ? req.originalUrl.substring(req.originalUrl.indexOf("?"))
    : "";
  const newUrl = `https://${firstSegment}.dwkanlink.com/${remainingPath}${queryString}`;

  return res.redirect(301, newUrl);
});

// --- SEO PRE-RENDER FOR BOTS ---
// Must be BEFORE routers so crawlers get HTML with meta tags
app.use(seoPrerender);

// --- ROUTERS ---
app.use("/api", allRouters);

// Sitemap route - served at root level for SEO
app.use("/", sitemapRouter);

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

// --- FRONTEND STATIC FILES + SPA FALLBACK ---
// Serve the built React app so the VPS works without a separate Nginx static config.
// In production the frontend dist lives one level up: ../frontend/dist
const frontendDistPath =
  process.env.FRONTEND_DIST_PATH ||
  path.join(process.cwd(), "..", "frontend", "dist");

if (fs.existsSync(frontendDistPath)) {
  // Serve hashed assets (CSS, JS, images) with long-term caching
  app.use(
    express.static(frontendDistPath, {
      maxAge: "1y",
      immutable: true,
      index: false, // let the SPA fallback handle directory requests
    }),
  );

  // SPA fallback: any GET that didn't match a real file → serve index.html
  // Exclude /api routes so API 404s still return JSON
  app.get("/*path", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res
        .status(404)
        .json({ error: "API route not found", path: req.path });
    }
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

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
