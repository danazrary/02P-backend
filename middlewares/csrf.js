import {
  generateCsrfSecret,
  generateCsrfToken,
} from "../utils/csrfProtection.js";

const csrfMiddleware = (req, res, next) => {
  let csrfSecret = req.cookies.csrfSecret;

  // Generate secret if not already stored in cookie
  if (!csrfSecret) {
    csrfSecret = generateCsrfSecret();
    res.cookie("csrfSecret", csrfSecret, {
      httpOnly: true,
      secure: process.env.ENVIRONMENT === "product", // true only in production
      sameSite: "strict",
      maxAge: 10 * 60 * 1000, // 10 minutes
    });
  }

  // Generate token from the secret
  const csrfToken = generateCsrfToken(csrfSecret);

  // Store token for frontend to use
  res.locals.csrfToken = csrfToken;

  next();
};

export default csrfMiddleware;
