// backend/middlewares/jwtVerify.js
import jwt from "jsonwebtoken";
import { clearCookieOpts } from "../utils/addingToken.js";

function extractToken(req, cookieName = "s_t") {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return req.cookies?.[cookieName] || null;
}

// 1️⃣ Seller Token Verification
export const jwtVerifySellerToken = (req, res, next) => {
  const token = extractToken(req, "s_t");

  if (!token) {
    return res.status(401).json({
      logout: true,
      token: "missing",
      error: true,
      errorMsg: "Please login first.",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      res.clearCookie("s_t", clearCookieOpts());

      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          logout: true,
          token: "expired",
          error: true,
          errorMsg: "Session expired. Please login again.",
        });
      }

      return res.status(401).json({
        logout: true,
        token: "invalid",
        error: true,
        errorMsg: "Invalid token. Please login again.",
      });
    }

    req.user = decoded;
    next();
  });
};

// 2️⃣ Detect Seller (Optional check)
export const detectSeller = (req, res, next) => {
  const token = extractToken(req, "s_t");

  req.isSeller = false;
  req.seller = null;

  if (!token) return next();

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      req.isSeller = true;
      req.seller = decoded;
    }
    next();
  });
};

// 3️⃣ Check Me (Admin -> Seller -> Customer)
export const checkMe = (req, res, next) => {
  const adminToken = extractToken(req, "admin_token");
  const sellerToken = extractToken(req, "s_t");

  req.user = {
    role: "customer",
    data: null,
  };

  // ADMIN
  if (adminToken) {
    return jwt.verify(
      adminToken,
      process.env.ADMIN_JWT_SECRET,
      (err, decoded) => {
        if (err || !decoded) {
          res.clearCookie("admin_token", clearCookieOpts());
          return next();
        }
        req.user = {
          role: "admin",
          data: decoded,
        };
        return next();
      },
    );
  }

  // SELLER / STAFF
  if (sellerToken) {
    return jwt.verify(sellerToken, process.env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) {
        res.clearCookie("s_t", clearCookieOpts());
        return next();
      }

      req.user = {
        role: decoded.role || "seller",
        data: decoded,
      };
      return next();
    });
  }

  next();
};

// 4️⃣ Admin Auth Guard
export const adminAuth = (req, res, next) => {
  const token = extractToken(req, "admin_token");

  if (!token) {
    return res.status(401).json({
      error: true,
      success: false,
      message: "Admin not authenticated",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (decoded.role !== "admin" && decoded.role !== "super_admin") {
      res.clearCookie("admin_token", clearCookieOpts());
      return res.status(403).json({
        error: true,
        success: false,
        message: "Access denied",
      });
    }

    req.admin = decoded;
    next();
  } catch {
    res.clearCookie("admin_token", clearCookieOpts());
    return res.status(401).json({
      error: true,
      success: false,
      message: "Session expired, please login again",
    });
  }
};
