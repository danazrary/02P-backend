// backend/middlewares/staffPermissions.js
//
// ════════════════════════════════════════════════════════════════
//  PERMISSION GUARDS — what is this caller allowed to do?
// ════════════════════════════════════════════════════════════════
//
//  Roles and their permissions live in ../utils/staffRoles.js (single source
//  of truth). These guards only ask `req.actor.can(<permission>)`, so adding a
//  new role never requires touching this file or any route.
//
//  Every guard below is an ARRAY [requireAuth, attachActor, check], so it works
//  on its own — no need to put checkMe / jwtVerifySellerToken in front of it:
//
//    router.post("/products", requirePermission("addProduct"), handler);
//    router.get("/orders", canViewOrders, handler);
//    router.put("/x", requireAnyPermission("editProduct", "manageCategories"), handler);
//    router.delete("/y", requireOwner, handler);
//    router.get("/z", requireRole("cashier", "admin"), handler);
//
//  Inside the handler:
//    req.actor.sellerId      the shop to work on (ALWAYS scope your queries with it)
//    req.actor.role          "seller" | "admin" | "cashier" | ...
//    req.actor.isStaff       true for staff
//    req.actor.name          staff name (owner: "")
//    res.locals.sellerId     same values, kept for older handlers

import { isKnownPermission } from "../utils/staffRoles.js";
import { ANONYMOUS_ACTOR, requireAuth, sendAuthError } from "./jwtVerify.js";

// ────────────────────────────────────────────────────────────────
//  Actor helpers
// ────────────────────────────────────────────────────────────────

/** Legacy helper: same return shape as before, now backed by req.actor. */
export function resolveActor(req) {
  const actor = req.actor || ANONYMOUS_ACTOR;
  return {
    sellerId: actor.sellerId,
    role: actor.isShopUser ? actor.role : null,
    isStaff: actor.isStaff,
    staffName: actor.isStaff ? actor.name : null,
    staffId: actor.staffId,
  };
}

export function attachActor(req, res, next) {

  const actor = req.actor || ANONYMOUS_ACTOR;

  res.locals.actor = actor;
  res.locals.sellerId = actor.sellerId;
  res.locals.role = actor.isShopUser ? actor.role : null;
  res.locals.isStaff = actor.isStaff;
  res.locals.staffName = actor.isStaff ? actor.name : null;
  res.locals.staffId = actor.staffId;

  next();
}

// ────────────────────────────────────────────────────────────────
//  Guard factories
// ────────────────────────────────────────────────────────────────
function forbid(req, res, actor, extra = {}) {
  console.warn(
    `🛑 [403 FORBIDDEN] ${req.method} ${req.originalUrl} | role [${actor.role}]`,
    extra,
  );
  return res.status(403).json({
    success: false,
    error: true,
    message: `ئەم کردارە بۆ ڕۆڵی (${actor.role}) ڕێگەپێدراو نییە.`,
    currentRole: actor.role,
    ...extra,
  });
}

function assertKnownPermissions(permissions) {
  for (const permission of permissions) {
    if (!isKnownPermission(permission)) {
      // Fails at server start, so a typo can never silently lock everybody out.
      throw new Error(`[staffPermissions] Unknown permission "${permission}"`);
    }
  }
}

function check(test, describe) {
  return (req, res, next) => {
    const actor = req.actor;
    if (!actor?.isShopUser)
      return sendAuthError(res, req.authError || "missing");
    if (!test(actor)) return forbid(req, res, actor, describe);
    return next();
  };
}

/** Caller must have ALL listed permissions. */
export function requirePermission(...permissions) {
  assertKnownPermissions(permissions);
  return [
    requireAuth,
    attachActor,
    check((actor) => permissions.every((p) => actor.can(p)), {
      requiredPermissions: permissions,
    }),
  ];
}

/** Caller must have AT LEAST ONE of the listed permissions. */
export function requireAnyPermission(...permissions) {
  assertKnownPermissions(permissions);
  return [
    requireAuth,
    attachActor,
    check((actor) => permissions.some((p) => actor.can(p)), {
      requiredAnyPermission: permissions,
    }),
  ];
}

/** Caller's role must be one of the listed roles ("seller" = owner). Prefer permissions. */
export function requireRole(...roles) {
  return [
    requireAuth,
    attachActor,
    check((actor) => roles.includes(actor.role), { allowedRoles: roles }),
  ];
}

/** Only the shop owner. */
export const requireOwner = [
  requireAuth,
  attachActor,
  check((actor) => actor.isSeller, { requiredRole: "seller" }),
];

/** Any logged-in shop user (owner or staff), no specific permission. */
export const requireShopUser = [requireAuth, attachActor];

// ────────────────────────────────────────────────────────────────
//  Ready-made guards (same names as before)
// ────────────────────────────────────────────────────────────────
export const canAddProduct = requirePermission("addProduct");
export const canEditProduct = requirePermission("editProduct");
export const canDeleteProduct = requirePermission("deleteProduct");
export const canBulkCategory = requirePermission("bulkCategory");
export const canManageDiscount = requirePermission("manageDiscount");
export const canManageCategories = requirePermission("manageCategories");
export const canManageShopSections = requirePermission("manageShopSections");
export const canManageRedLine = requirePermission("manageRedLine");
export const canViewOrders = requirePermission("viewOrders");
export const canUpdateOrderStatus = requirePermission("updateOrderStatus");
export const canManageCustomers = requirePermission("manageCustomers");
export const canManageSettings = requirePermission("manageSettings");
export const canChangeShopIdentity = requirePermission("changeShopIdentity");
export const canManageStaff = requirePermission("manageStaff");
export const canDeleteAccount = requirePermission("deleteAccount");
export const canViewAnalytics = requirePermission("viewAnalytics");
export const canManagePushNotifications = requirePermission(
  "managePushNotifications",
);
export const canViewCatalog = requirePermission("viewCatalog");
// new
export const canAccessDashboard = requirePermission("accessDashboard");
export const canUsePOS = requirePermission("usePOS");

// The permission matrix is defined in ../utils/staffRoles.js
