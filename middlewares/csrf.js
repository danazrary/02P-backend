import {
  generateCsrfSecret,
  generateCsrfToken,
} from "../utils/csrfProtection.js";

const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
const isProductionEnvironment =
  process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "product";

const csrfMiddleware = (req, res, next) => {
  let csrfSecret = req.cookies.csrfSecret;

  // Generate secret if not already stored in cookie
  if (!csrfSecret) {
    csrfSecret = generateCsrfSecret();
    const opts = {
      httpOnly: true,
      secure: isProductionEnvironment,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
    };
    if (isProductionEnvironment) {
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
