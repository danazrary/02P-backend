import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const isSecure =
  process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "product";

// Centralized cookie options for subdomain support
// In production, cookies are shared across *.dwkanlink.com via domain attribute
const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
function cookieOpts(maxAge) {
  const opts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge,
    path: "/",
  };
  if (isSecure) {
    opts.domain = `.${baseDomain}`;
  }
  return opts;
}

// Reusable clear-cookie options (must match set options minus maxAge)
export function clearCookieOpts() {
  const opts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
  };
  if (isSecure) {
    opts.domain = `.${baseDomain}`;
  }
  return opts;
}

//.
//.
//.
//seller token
export function sellerToken(id, email, shop_name, res) {
  const expiresInHours = 24 * 7;

  const payload = {
    id,
    email: typeof email === "string" ? email : "", // make sure it's string
    shop_name: shop_name || "",
    isSeller: true,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: `${expiresInHours}h`,
  });

  res.cookie("s_t", token, cookieOpts(expiresInHours * 60 * 60 * 1000));

  return token;
}

export function shortSellerToken(id, info, res) {
  // info should be a simple string or object with plain fields
  const payload = {
    id,
    info: typeof info === "string" ? info : JSON.stringify(info), // safe serialization
    isSeller: true,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "3m", // 3 minutes
  });

  res.cookie("s_t", token, cookieOpts(3 * 60 * 1000));

  return token;
}

// admin token
export function adminToken(id, email, res) {
  const token = jwt.sign({ id, email, isAdmin: true }, process.env.JWT_SECRET, {
    expiresIn: "10m", // 10 minutes
  });

  res.cookie("a_t", token, cookieOpts(10 * 60 * 1000));

  return token;
}
//.
//.
//admin refresh token
export function adminRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isAdmin: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "1d", // 1 day
    },
  );

  res.cookie("a_rt", refreshToken, cookieOpts(24 * 60 * 60 * 1000));

  return refreshToken;
}
//.
//.
//.
//user token
export function userToken(id, email, res) {
  const token = jwt.sign({ id, email, isUser: true }, process.env.JWT_SECRET, {
    expiresIn: "11m", // 11 minutes
  });

  res.cookie("u_t", token, cookieOpts(11 * 60 * 1000));

  return token;
}
//.
//.
//user refresh token
export function userRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isUser: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "14d", // 1 day
    },
  );

  res.cookie("u_rt", refreshToken, cookieOpts(24 * 60 * 60 * 1000 * 14));

  return refreshToken;
}

//.
//.
//.
//seller refresh token
export function sellerRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isSeller: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "14d", // 1 day
    },
  );

  res.cookie("s_rt", refreshToken, cookieOpts(24 * 60 * 60 * 1000 * 14));

  return refreshToken;
}
//.
//.
//.
//.
// verify path token
export function userVerifyPathToken(id, email, res) {
  const token = jwt.sign({ id, email, isUser: true }, process.env.JWT_SECRET, {
    expiresIn: "10m", // 11 minutes
  });

  res.cookie("uac_t", token, cookieOpts(10 * 60 * 1000));

  return token;
}
export function sellerVerifyPathToken(id, email, res) {
  const token = jwt.sign(
    { id, email, isSeller: true },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m", // 11 minutes
    },
  );

  res.cookie("sac_t", token, cookieOpts(10 * 60 * 1000));

  return token;
}
export function sellerFPPathToken(id, email, res) {
  const token = jwt.sign(
    { id, email, isSeller: true },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m", // 11 minutes
    },
  );

  res.cookie("s_fp_t", token, cookieOpts(10 * 60 * 1000));

  return token;
}
