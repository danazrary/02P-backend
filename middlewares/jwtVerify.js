// backend/middlewares/jwtVerify.js
//
// ════════════════════════════════════════════════════════════════
//  IDENTITY LAYER — who is sending this request?
// ════════════════════════════════════════════════════════════════
//
//  Every middleware below fills:
//    req.actor      who is calling (shape: see makeActor)
//    req.authError  why authentication failed:
//                   "missing" | "expired" | "invalid" | "revoked" | "server" | null
//
//  Three kinds of credentials, each verified with ITS OWN secret:
//    owner (seller)   cookie s_t        or Bearer   JWT_SECRET
//    staff            cookie st_t       or Bearer   STAFF_JWT_SECRET (see addingToken.js)
//    platform admin   cookie admin_token or Bearer  ADMIN_JWT_SECRET
//
//  Staff tokens carry no role. For every request the staff member is looked up
//  in seller.staff_members, so a removed / deactivated staff member (or a role
//  change) takes effect on the very next request.
//
//  req.actor shape:
//    type             "seller" | "staff" | "platform_admin" | "customer"
//    isAuthenticated  boolean
//    isSeller         shop owner
//    isStaff          staff member
//    isShopUser       isSeller || isStaff
//    isPlatformAdmin  boolean
//    sellerId         the shop (tenant) this request works on — ALWAYS scope queries with it
//    role             "seller" | "admin" | "product_manager" | ... | "platform_admin" | null
//    roleMeta         { key, label, emoji, home_page } | null
//    permissions      string[]
//    can(permission)  boolean
//    hasRole(...roles) boolean
//    staffId, name, email
//    raw              decoded token payload
//    seller           (staff only) the shop row that was loaded to verify the staff member

import jwt from "jsonwebtoken";
import Seller from "../database/sellerv2.js";
import {
  SELLER_COOKIE,
  STAFF_COOKIE,
  clearCookieOpts,
  verifyStaffToken,
} from "../utils/addingToken.js";
import { extractStaffArray } from "../utils/staffHelpers.js";
import {
  OWNER_ROLE,
  getPermissionsForRole,
  getRoleMeta,
  isStaffRole,
} from "../utils/staffRoles.js";

// ────────────────────────────────────────────────────────────────
//  Actor
// ────────────────────────────────────────────────────────────────
export function makeActor(fields = {}) {
  const role = fields.role ?? null;
  const permissions = Object.freeze([...(fields.permissions || [])]);
  const permissionSet = new Set(permissions);

  return Object.freeze({
    type: "customer",
    isAuthenticated: false,
    isSeller: false,
    isStaff: false,
    isPlatformAdmin: false,
    sellerId: null,
    staffId: null,
    roleMeta: null,
    name: "",
    email: "",
    raw: null,
    seller: null,
    ...fields,
    role,
    permissions,
    isShopUser: Boolean(fields.isSeller || fields.isStaff),
    can: (permission) => permissionSet.has(permission),
    hasRole: (...roles) => roles.includes(role),
  });
}

export const ANONYMOUS_ACTOR = makeActor();

function ownerActor(decoded) {
  return makeActor({
    type: "seller",
    isAuthenticated: true,
    isSeller: true,
    sellerId: decoded.id,
    role: OWNER_ROLE,
    roleMeta: getRoleMeta(OWNER_ROLE),
    permissions: getPermissionsForRole(OWNER_ROLE),
    email: typeof decoded.email === "string" ? decoded.email : "",
    raw: decoded,
  });
}

function platformAdminActor(decoded) {
  return makeActor({
    type: "platform_admin",
    isAuthenticated: true,
    isPlatformAdmin: true,
    role: "platform_admin",
    email: typeof decoded.email === "string" ? decoded.email : "",
    raw: decoded,
  });
}

/** Small object for audit columns / logs: "who made this change". */
export function actorSnapshot(actor) {
  return {
    type: actor.type,
    role: actor.role,
    id: actor.isStaff ? actor.staffId : actor.sellerId,
    name: actor.name,
    sellerId: actor.sellerId,
  };
}

// ────────────────────────────────────────────────────────────────
//  Token helpers
// ────────────────────────────────────────────────────────────────
function extractBearer(req) {
  const header = req.headers.authorization;
  return header && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function extractToken(req, cookieName) {
  return extractBearer(req) || req.cookies?.[cookieName] || null;
}

function verifyJwt(token, secret) {
  try {
    return { decoded: jwt.verify(token, secret) };
  } catch (err) {
    return { error: err?.name === "TokenExpiredError" ? "expired" : "invalid" };
  }
}

// The unverified payload is used ONLY to pick which secret to verify with.
// Verification then has to succeed with that secret, so a forged claim gains nothing.
function classifyBearer(token, includeAdmin) {
  const payload = jwt.decode(token);
  if (!payload || typeof payload !== "object") return null;
  if (payload.typ === "staff") return "staff";
  if (payload.isSeller) return "owner";
  return includeAdmin ? "admin" : null;
}

async function verifyStaffCandidate(token) {
  let decoded;
  try {
    decoded = verifyStaffToken(token);
  } catch (err) {
    if (err?.name === "TokenExpiredError") return { error: "expired" };
    if (err?.name === "JsonWebTokenError" || err?.name === "NotBeforeError") {
      return { error: "invalid" };
    }
    throw err; // configuration problem (missing secret) -> server error
  }

  const seller = await Seller.findByPk(decoded.seller_id, {
    attributes: [
      "id",
      "shop_name",
      "business_type",
      "name",
      "is_active",
      "staff_members",
    ],
  });
  if (!seller || seller.is_active === false) return { error: "revoked" };

  const member = extractStaffArray(seller).find(
    (s) => s.staff_id === decoded.staff_id,
  );
  if (!member || member.is_active === false) return { error: "revoked" };
  if (!isStaffRole(member.role)) return { error: "revoked" }; // role no longer exists

  return {
    actor: makeActor({
      type: "staff",
      isAuthenticated: true,
      isStaff: true,
      sellerId: seller.id,
      role: member.role,
      roleMeta: getRoleMeta(member.role),
      permissions: getPermissionsForRole(member.role),
      staffId: member.staff_id,
      name: member.name || "",
      email: member.email || "",
      raw: decoded,
      seller,
    }),
  };
}

async function verifyCandidate({ kind, token }) {
  if (kind === "admin") {
    const result = verifyJwt(token, process.env.ADMIN_JWT_SECRET);
    if (result.error) return result;
    return { actor: platformAdminActor(result.decoded) };
  }

  if (kind === "staff") return verifyStaffCandidate(token);

  if (kind === "owner") {
    const result = verifyJwt(token, process.env.JWT_SECRET);
    if (result.error) return result;

    // JWT_SECRET also signs short-lived helper tokens (password reset, verify
    // paths). Only real seller session tokens are accepted here.
    const { decoded } = result;
    if (decoded.isSeller !== true || decoded.purpose || !decoded.id) {
      return { error: "invalid" };
    }
    return { actor: ownerActor(decoded) };
  }

  return { error: "invalid" };
}

/**
 * Looks at every credential the request carries and returns the first valid one.
 * Expired / invalid / revoked cookies are cleared. Never throws.
 */
export async function resolveIdentity(req, res, { includeAdmin = true } = {}) {
  const cookies = req.cookies || {};
  const bearer = extractBearer(req);
  const candidates = [];

  if (includeAdmin && cookies.admin_token) {
    candidates.push({
      kind: "admin",
      token: cookies.admin_token,
      cookie: "admin_token",
    });
  }
  if (bearer) {
    candidates.push({
      kind: classifyBearer(bearer, includeAdmin),
      token: bearer,
      cookie: null,
    });
  }
  if (cookies[STAFF_COOKIE]) {
    candidates.push({
      kind: "staff",
      token: cookies[STAFF_COOKIE],
      cookie: STAFF_COOKIE,
    });
  }
  if (cookies[SELLER_COOKIE]) {
    candidates.push({
      kind: "owner",
      token: cookies[SELLER_COOKIE],
      cookie: SELLER_COOKIE,
    });
  }

  let lastError = "missing";

  for (const candidate of candidates) {
    let result;
    try {
      result = await verifyCandidate(candidate);
    } catch (err) {
      console.error("[auth] identity check failed:", err);
      return { actor: ANONYMOUS_ACTOR, error: "server" };
    }

    if (result.actor) return { actor: result.actor, error: null };

    lastError = result.error;
    if (candidate.cookie) res.clearCookie(candidate.cookie, clearCookieOpts());
  }

  return { actor: ANONYMOUS_ACTOR, error: lastError };
}

// ────────────────────────────────────────────────────────────────
//  Legacy req.user shapes (so existing routes keep working)
// ────────────────────────────────────────────────────────────────
// Old jwtVerifySellerToken: req.user = decoded token payload (flat)
function toFlatUser(actor) {
  if (actor.isStaff) {
    return {
      role: "staff",
      staff_role: actor.role,
      staff_id: actor.staffId,
      staff_name: actor.name,
      email: actor.email,
      seller_id: actor.sellerId,
      parent_seller_id: actor.sellerId,
      shop_name: actor.seller?.shop_name,
    };
  }
  return actor.raw;
}

// Old checkMe: req.user = { role, data }
function toCheckMeUser(actor) {
  if (actor.isPlatformAdmin) return { role: "admin", data: actor.raw };
  if (actor.isShopUser) {
    return {
      role: actor.isStaff ? "staff" : "seller",
      data: toFlatUser(actor),
    };
  }
  return { role: "customer", data: null };
}

const AUTH_ERROR_MESSAGES = {
  missing: "Please login first.",
  expired: "Session expired. Please login again.",
  invalid: "Invalid token. Please login again.",
  revoked: "Your access was removed. Please login again.",
};

/** 401 in the same shape the frontend already understands ({ logout, token, error, errorMsg }). */
export function sendAuthError(res, error = "missing") {
  if (error === "server") {
    return res.status(500).json({
      success: false,
      error: true,
      errorMsg: "Server error while checking your session.",
    });
  }
  return res.status(401).json({
    logout: true,
    token: error,
    error: true,
    errorMsg: AUTH_ERROR_MESSAGES[error] || AUTH_ERROR_MESSAGES.invalid,
  });
}

// ────────────────────────────────────────────────────────────────
//  Middlewares
// ────────────────────────────────────────────────────────────────

/**
 * Optional identity (never blocks). Admin -> staff -> seller -> customer.
 * Used by /check-me and by routes that behave differently per caller.
 */
export async function checkMe(req, res, next) {
  try {
    const { actor, error } = await resolveIdentity(req, res, {
      includeAdmin: true,
    });
    if (error === "server") {
      return res
        .status(503)
        .json({ error: true, message: "Auth service unavailable" });
    }
    req.actor = actor;
    req.authError = error;
    req.user = toCheckMeUser(actor);
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Required identity: only a shop owner or a staff member gets through.
 * Everyone else receives a 401 with { logout: true, token: <reason> }.
 */
export async function requireAuth(req, res, next) {

  
  try {
   
    if (req.actor?.isShopUser) return next(); // already resolved earlier in the chain

    const { actor, error } = await resolveIdentity(req, res, {
      includeAdmin: false,
    });
   
    if (!actor.isShopUser) return sendAuthError(res, error || "missing");

    req.actor = actor;
    req.authError = null;
    //console.log("066", req.actor, "isShopUser:", req.actor.isShopUser);
    if (!req.user) req.user = toFlatUser(actor);

    return next();
  } catch (err) {
   
    return next(err);
  }
}

// Legacy name. Now accepts BOTH seller and staff sessions and sets the
// old flat req.user shape for handlers that still read it.
export async function jwtVerifySellerToken(req, res, next) {
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    req.user = toFlatUser(req.actor);
    return next();
  });
}

/** Optional check used by public pages: is the visitor the shop owner (or staff)? Never blocks. */
export async function detectSeller(req, res, next) {
  req.isSeller = false;
  req.isStaff = false;
  req.seller = null;
  req.actor = ANONYMOUS_ACTOR;
  req.authError = null;

  try {
    const { actor, error } = await resolveIdentity(req, res, {
      includeAdmin: false,
    });
    req.actor = actor;
    req.authError = error;
    req.isSeller = actor.isSeller;
    req.isStaff = actor.isStaff;
    req.seller = actor.isSeller ? actor.raw : null;
  } catch (err) {
    console.error("[auth] detectSeller failed:", err);
  }
  return next();
}

// Platform admin guard (unchanged behaviour)
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
