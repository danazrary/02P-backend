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
  const { admin_token, s_t } = req.cookies;

  // default → customer
  req.user = {
    role: "customer",
    data: null,
  };

  // 1️⃣ ADMIN has priority
  if (admin_token) {
    return jwt.verify(
      admin_token,
      process.env.ADMIN_JWT_SECRET,
      (err, decoded) => {
        if (err || !decoded) {
          // ❌ invalid / expired → remove cookie
          res.clearCookie("admin_token", {
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
          });
          return next();
        }

        // ✅ valid admin
        req.user = {
          role: "admin",
          data: decoded,
        };

        return next();
      },
    );
  }

  // 2️⃣ SELLER
  if (s_t) {
    return jwt.verify(s_t, process.env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) {
        // ❌ invalid / expired → remove cookie
        res.clearCookie("s_t", {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
        });
        return next();
      }

      // ✅ valid seller
      req.user = {
        role: "seller",
        data: decoded,
      };

      return next();
    });
  }

  // 3️⃣ CUSTOMER (no token)
  next();
};

//.
//.
//.
// admin
export const adminAuth = (req, res, next) => {
  const token = req.cookies.admin_token;

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
      res.clearCookie("admin_token");
      return res.status(403).json({
        error: true,
        success: false,
        message: "Access denied",
      });
    }

    req.admin = decoded;
    next();
  } catch {
    res.clearCookie("admin_token");
    return res.status(401).json({
      error: true,
      success: false,
      message: "Session expired, please login again",
    });
  }
};
