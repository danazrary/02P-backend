import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const isSecure =
  process.env.NODE_ENV === "production" ||
  process.env.ENVIRONMENT === "product";

// Centralized cookie options for subdomain support
// In production, cookies are shared across *.dwkanlink.com via domain attribute
const baseDomain = (process.env.BASE_DOMAIN || "dwkanlink.com")
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/^\./, "")
  .split(":")[0];
function cookieOpts(maxAge) {
  const opts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge,
    path: "/",
  };
  if (isSecure) {
    opts.domain = baseDomain;
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
    opts.domain = baseDomain;
  }
  return opts;
}

// ════════════════════════════════════════════════════════════════
//  Cookie names — one per kind of identity, so they can never be mixed up
// ════════════════════════════════════════════════════════════════
export const SELLER_COOKIE = "s_t"; // shop owner session
export const STAFF_COOKIE = "st_t"; // staff session

// ════════════════════════════════════════════════════════════════
//  STAFF TOKEN
//  - signed with its own secret (STAFF_JWT_SECRET, or a key derived from
//    JWT_SECRET) so a staff token can never verify as a seller token
//    and a seller token can never verify as a staff token
//  - carries NO role: the role is read from the database on every request,
//    so changing a role / removing a staff member works immediately
// ════════════════════════════════════════════════════════════════
const STAFF_TOKEN_TYPE = "staff";
const STAFF_TOKEN_ISSUER = "dwkanlink";
const STAFF_TOKEN_AUDIENCE = "dwkanlink:staff";
const STAFF_TOKEN_HOURS = 24 * 7;

function getStaffSecret() {
  if (process.env.STAFF_JWT_SECRET) return process.env.STAFF_JWT_SECRET;
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET (or STAFF_JWT_SECRET) must be configured");
  }
  // Derived key: different from JWT_SECRET, no extra env variable required.
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update("dwkanlink:staff-token:v1")
    .digest("hex");
}

export function staffToken(staffMember, sellerId, res) {
  const token = jwt.sign(
    {
      typ: STAFF_TOKEN_TYPE,
      staff_id: staffMember.staff_id,
      seller_id: sellerId,
    },
    getStaffSecret(),
    {
      expiresIn: `${STAFF_TOKEN_HOURS}h`,
      issuer: STAFF_TOKEN_ISSUER,
      audience: STAFF_TOKEN_AUDIENCE,
    },
  );

  // One identity per browser: a staff login replaces any seller session.
  res.clearCookie(SELLER_COOKIE, clearCookieOpts());
  res.cookie(
    STAFF_COOKIE,
    token,
    cookieOpts(STAFF_TOKEN_HOURS * 60 * 60 * 1000),
  );

  return token;
}

/** Throws (JsonWebTokenError / TokenExpiredError) when the token is not a valid staff token. */
export function verifyStaffToken(token) {
  const decoded = jwt.verify(token, getStaffSecret(), {
    issuer: STAFF_TOKEN_ISSUER,
    audience: STAFF_TOKEN_AUDIENCE,
  });

  if (
    decoded.typ !== STAFF_TOKEN_TYPE ||
    !decoded.staff_id ||
    !decoded.seller_id
  ) {
    throw new jwt.JsonWebTokenError("invalid staff token");
  }
  return decoded;
}

export function clearStaffCookie(res) {
  res.clearCookie(STAFF_COOKIE, clearCookieOpts());
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

  // One identity per browser: a seller login replaces any staff session.
  clearStaffCookie(res);
  res.cookie(SELLER_COOKIE, token, cookieOpts(expiresInHours * 60 * 60 * 1000));

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
