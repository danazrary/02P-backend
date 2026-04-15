import {
  generateCsrfSecret,
  generateCsrfToken,
} from "../utils/csrfProtection.js";

const isSecure = process.env.ENVIRONMENT === "product";
const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";

const csrfMiddleware = (req, res, next) => {
  let csrfSecret = req.cookies.csrfSecret;

  // Generate secret if not already stored in cookie
  if (!csrfSecret) {
    csrfSecret = generateCsrfSecret();
    const opts = {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
    };
    if (isSecure) {
      opts.domain = `.${baseDomain}`;
    }
    res.cookie("csrfSecret", csrfSecret, opts);
  }

  // Generate token from the secret
  const csrfToken = generateCsrfToken(csrfSecret);

  // Store token for frontend to use
  res.locals.csrfToken = csrfToken;

  next();
};

export default csrfMiddleware;
