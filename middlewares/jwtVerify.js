

import jwt from "jsonwebtoken";


//.
//.
//.
//seller token
export const jwtVerifySellerToken = (req, res, next) => {
  const { s_t } = req.cookies;

  if (!s_t) {
    return res.status(401).json({
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
          token: "expired",
          error: true,
          errorMsg: "Session expired. Please login again.",
        });
      }

      return res.status(401).json({
        token: "invalid",
        error: true,
        errorMsg: "Invalid token. Please login again.",
      });
    }

    req.user = user;
    next();
  });
};

