import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import hpp from "hpp";
import http from "http";
import https from "https";
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

// Load environment variables (.env.product, .env.developedLH, .env.developingURL)
dotenv.config();

// --- CREATE EXPRESS APP ---
const app = express();
app.set("trust proxy", 1);
app.use(passport.initialize());

// --- MIDDLEWARE ---
app.use((req, res, next) => {
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
});

app.use(cors(corsOptions));
app.use("/", apiLimiter);
app.use(helmet());
app.use(hpp());
app.use(bodyParser.json({ limit: process.env.BODY_LIMIT || "2mb" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: process.env.BODY_LIMIT || "2mb",
  })
);
if (typeof sanitizeHtmlMiddleware === "function")
  app.use(sanitizeHtmlMiddleware);
app.use(cookieParser(process.env.COOKIE_SECRET_PARSER || ""));
app.use(csrfMiddleware);

// --- ROUTERS ---
app.use("/api", allRouters);

app.get("/profile", (req, res) => {
  console.log("pppppp");

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
  console.log("test");

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

// --- SERVER CONFIG ---
const port = Number(process.env.PORT || 3001);
const mode = process.env.ENVIRONMENT?.trim() || "product";
const bindHost = process.env.BIND_HOST || "127.0.0.1";

// --- SERVER START FUNCTIONS ---
function startHttpsServer() {
  try {
    const privateKey = fs.readFileSync(process.env.HTTPS_KEY_PATH, "utf8");
    const certificate = fs.readFileSync(process.env.HTTPS_CERT_PATH, "utf8");
    const credentials = { key: privateKey, cert: certificate };

    https.createServer(credentials, app).listen(port, bindHost, () => {
      console.log(
        `🔒 HTTPS server running on https://${bindHost}:${port} (mode=${mode})`
      );
    });
  } catch (err) {
    console.error("❌ Failed to start HTTPS server:", err);
    process.exit(1);
  }
}

function startHttpServer() {
  http.createServer(app).listen(port, bindHost, () => {
    console.log(
      `🚀 HTTP server running on http://${bindHost}:${port} (mode=${mode})`
    );
  });
}

// --- START SERVER BASED ON MODE ---
if (mode === "product" || mode === "developingURL") {
  startHttpsServer();
} else {
  startHttpServer(); // Default to HTTP for all modes
}

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
