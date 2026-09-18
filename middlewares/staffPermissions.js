// backend/middlewares/staffPermissions.js

export function resolveActor(req) {
  const user = req.user;
  if (!user) {
    return { sellerId: null, role: null, isStaff: false, staffName: null };
  }

  if (user.role === "staff") {
    return {
      sellerId: user.seller_id ?? user.parent_seller_id,
      role: user.staff_role ?? "cashier",
      isStaff: true,
      staffName: user.staff_name ?? null,
      staffId: user.staff_id ?? null,
    };
  }

  return {
    sellerId: user.id ?? user.seller_id,
    role: "seller",
    isStaff: false,
    staffName: null,
    staffId: null,
  };
}

function denyRoles(...deniedRoles) {
  return (req, res, next) => {
    const { role } = resolveActor(req);
    if (deniedRoles.includes(role)) {
      console.warn(
        `🛑 [403 FORBIDDEN] Path: ${req.method} ${req.originalUrl} | Role [${role}] is denied!`,
      );
      return res.status(403).json({
        success: false,
        error: true,
        message: `ئەم کردارە بۆ ڕۆڵی (${role}) ڕێگەپێدراو نییە.`,
        requiredRole: "seller or admin",
      });
    }
    next();
  };
}

function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    const { role } = resolveActor(req);
    if (!allowedRoles.includes(role)) {
      console.warn(
        `🛑 [403 FORBIDDEN] Path: ${req.method} ${req.originalUrl} | Current Role: [${role}] | Allowed:`,
        allowedRoles,
      );
      return res.status(403).json({
        success: false,
        error: true,
        message: `ئەم کردارە بۆ ڕۆڵی (${role}) ڕێگەپێدراو نییە.`,
        allowedRoles,
        currentRole: role,
      });
    }
    next();
  };
}

export const canAddProduct = allowRoles("seller", "admin", "product_manager");
export const canEditProduct = allowRoles("seller", "admin", "product_manager");
export const canDeleteProduct = allowRoles("seller", "admin");
export const canManageDiscount = allowRoles("seller", "admin");
export const canManageCategories = allowRoles("seller", "admin", "shop_editor");
export const canManageShopSections = allowRoles(
  "seller",
  "admin",
  "shop_editor",
);
export const canManageRedLine = allowRoles("seller", "admin", "shop_editor");
export const canViewOrders = allowRoles("seller", "admin");
export const canUpdateOrderStatus = allowRoles("seller", "admin");
export const canManageCustomers = allowRoles("seller", "admin");
export const canManageSettings = allowRoles("seller", "admin");
export const canChangeShopIdentity = allowRoles("seller");
export const canManageStaff = allowRoles("seller");
export const canDeleteAccount = allowRoles("seller");
export const canViewAnalytics = allowRoles("seller", "admin");
export const canManagePushNotifications = allowRoles("seller", "admin");
export const canViewCatalog = allowRoles("seller", "admin", "product_manager");

export function attachActor(req, res, next) {
  const actor = resolveActor(req);
  res.locals.sellerId = actor.sellerId;
  res.locals.role = actor.role;
  res.locals.isStaff = actor.isStaff;
  res.locals.staffName = actor.staffName;
  res.locals.staffId = actor.staffId;
  next();
}

// ════════════════════════════════════════════════════════════════
//  Summary table (for documentation)
// ════════════════════════════════════════════════════════════════
/*
  Action                      | seller | admin | product_manager | shop_editor | cashier
  ----------------------------|--------|-------|-----------------|-------------|--------
  Add product                 |   ✅   |  ✅   |       ✅        |     ❌      |   ❌
  Edit product                |   ✅   |  ✅   |       ✅        |     ❌      |   ❌
  Delete product              |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Bulk delete products        |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Add/remove discount         |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Add/remove free delivery    |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Cashback management         |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  View catalog                |   ✅   |  ✅   |       ✅        |     ❌      |   ❌
  Bulk update category        |   ✅   |  ✅   |       ✅        |     ❌      |   ❌
  Manage categories           |   ✅   |  ✅   |       ❌        |     ✅      |   ❌
  Manage shop sections        |   ✅   |  ✅   |       ❌        |     ✅      |   ❌
  Manage red line             |   ✅   |  ✅   |       ❌        |     ✅      |   ❌
  View orders                 |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Update order status         |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  View analytics/dashboard    |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Manage customers            |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  General settings            |   ✅   |  ✅   |       ❌        |     ❌      |   ❌
  Change shop identity *      |   ✅   |  ❌   |       ❌        |     ❌      |   ❌
  Add/remove staff            |   ✅   |  ❌   |       ❌        |     ❌      |   ❌
  Delete account              |   ✅   |  ❌   |       ❌        |     ❌      |   ❌
  Push notifications          |   ✅   |  ✅   |       ❌        |     ❌      |   ❌

  * shop identity = shop_name, phone, password, brand_color, shop_image
*/
