//jwtVerifySellerToken --- detectSeller
import jwt from "jsonwebtoken";

//.
//.
//.
//seller token
export const jwtVerifySellerToken = (req, res, next) => {
  const { s_t } = req.cookies;

  if (!s_t) {
    return res.status(401).json({
      logout: true,
      token: "missing",
      error: true,
      errorMsg: "Please login first.",
    });
  }

  jwt.verify(s_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // 🔥 MATCH COOKIE OPTIONS EXACTLY
      res.clearCookie("s_t", {
        httpOnly: true,
        secure: process.env.ENVIRONMENT === "product",
        sameSite: "strict",
        path: "/",
      });

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

    req.user = user;
    next();
  });
};
//.
//.
//.
// detectSeller
export const detectSeller = (req, res, next) => {
  const { s_t } = req.cookies;

  // default: not seller
  req.isSeller = false;
  req.seller = null;

  if (!s_t) return next();

  jwt.verify(s_t, process.env.JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      req.isSeller = true;
      req.seller = decoded; // optional (seller id, role, etc)
    }
    // even if token invalid → continue normally
    next();
  });
};

//.
//.
//.
// check me
export const checkMe = (req, res, next) => {
  const { a_t, s_t } = req.cookies;

  // default → customer
  req.user = {
    role: "customer",
    data: null,
  };

  // 1️⃣ ADMIN has priority
  if (a_t) {
    return jwt.verify(a_t, process.env.JWT_SECRET, (err, decoded) => {
      if (!err && decoded) {
        req.user = {
          role: "admin",
          data: decoded,
        };
      }
      return next();
    });
  }

  // 2️⃣ SELLER
  if (s_t) {
    return jwt.verify(s_t, process.env.JWT_SECRET, (err, decoded) => {
      if (!err && decoded) {
        req.user = {
          role: "seller",
          data: decoded,
        };
      }
      return next();
    });
  }

  // 3️⃣ CUSTOMER (no token)
  next();
};


