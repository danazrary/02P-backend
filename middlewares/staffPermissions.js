// backend/middlewares/staffPermissions.js
//
// ════════════════════════════════════════════════════════════════
//  STAFF ROLE PERMISSION SYSTEM — Dwkan Link
// ════════════════════════════════════════════════════════════════
//
//  Roles and what they CAN do:
//
//  seller        → everything (no restriction)
//
//  admin         → everything EXCEPT:
//                  • change shop_name / phone / password
//                  • change brand_color / shop identity
//                  • add/edit/delete staff members
//
//  product_manager → add products, edit products, manage product images
//                    CANNOT: delete products, add/remove discounts,
//                    manage categories, manage shop sections, orders, settings
//
//  shop_editor   → manage shop sections (hero, flash_banner, brands …)
//                  manage categories (add/edit/delete/sort)
//                  CANNOT: touch products, orders, discounts, settings
//
//  cashier       → read-only (future dedicated pages)
//                  currently CANNOT do anything write-related
//
// ════════════════════════════════════════════════════════════════

/**
 * Resolves the sellerId and the actor's role from the JWT.
 *
 *  • Regular seller  → role = "seller",  sellerId = req.user.id
 *  • Staff member    → role = staff_role, sellerId = req.user.seller_id
 */
export function resolveActor(req) {
  const user = req.user;
  if (!user)
    return { sellerId: null, role: null, isStaff: false, staffName: null };

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

// ──────────────────────────────────────────────────────────────
//  Granular permission guards (used as Express middleware)
//  Each one calls next() when allowed, or returns 403 when denied.
// ──────────────────────────────────────────────────────────────

/** Roles that are fully blocked from an endpoint */
function denyRoles(...deniedRoles) {
  return (req, res, next) => {
    const { role } = resolveActor(req);
    if (deniedRoles.includes(role)) {
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

/** Only these roles may pass */
function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    const { role } = resolveActor(req);
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: true,
        message: `ئەم کردارە بۆ ڕۆڵی (${role}) ڕێگەپێدراو نییە.`,
        allowedRoles,
      });
    }
    next();
  };
}

// ════════════════════════════════════════════════════════════════
//  Named permission middlewares  (import and add to any route)
// ════════════════════════════════════════════════════════════════

/**
 * canAddProduct
 * Allowed: seller, admin, product_manager
 */
export const canAddProduct = allowRoles("seller", "admin", "product_manager");

/**
 * canEditProduct
 * Allowed: seller, admin, product_manager
 */
export const canEditProduct = allowRoles("seller", "admin", "product_manager");

/**
 * canDeleteProduct
 * Allowed: seller, admin
 * Denied:  product_manager, shop_editor, cashier
 */
export const canDeleteProduct = allowRoles("seller", "admin");

/**
 * canManageDiscount
 * Discount / free-delivery / cashback bulk operations
 * Allowed: seller, admin
 * Denied:  product_manager, shop_editor, cashier
 */
export const canManageDiscount = allowRoles("seller", "admin");

/**
 * canManageCategories
 * Add/edit/delete/sort seller categories
 * Allowed: seller, admin, shop_editor
 */
export const canManageCategories = allowRoles("seller", "admin", "shop_editor");

/**
 * canManageShopSections
 * Hero, flash_banner, brands, featured_categories …
 * Allowed: seller, admin, shop_editor
 */
export const canManageShopSections = allowRoles(
  "seller",
  "admin",
  "shop_editor",
);

/**
 * canManageRedLine
 * Red line announcement banner
 * Allowed: seller, admin, shop_editor
 */
export const canManageRedLine = allowRoles("seller", "admin", "shop_editor");

/**
 * canViewOrders
 * Allowed: seller, admin
 * (cashier will get its own order page in the future)
 */
export const canViewOrders = allowRoles("seller", "admin");

/**
 * canUpdateOrderStatus
 * Allowed: seller, admin
 */
export const canUpdateOrderStatus = allowRoles("seller", "admin");

/**
 * canManageCustomers
 * Seller customer list, notes, block/unblock
 * Allowed: seller, admin
 */
export const canManageCustomers = allowRoles("seller", "admin");

/**
 * canManageSettings
 * General shop settings (bio, social links, location, language, order_type …)
 * Allowed: seller, admin
 */
export const canManageSettings = allowRoles("seller", "admin");

/**
 * canChangeShopIdentity
 * shop_name, phone, password, brand_color, shop_image
 * ONLY the seller (owner) — NOT even admin staff
 */
export const canChangeShopIdentity = allowRoles("seller");

/**
 * canManageStaff
 * Add / edit / delete / list staff members
 * ONLY the seller (owner)
 */
export const canManageStaff = allowRoles("seller");

/**
 * canDeleteAccount
 * ONLY the seller (owner)
 */
export const canDeleteAccount = allowRoles("seller");

/**
 * canViewAnalytics / Dashboard data
 * Allowed: seller, admin
 */
export const canViewAnalytics = allowRoles("seller", "admin");

/**
 * canManagePushNotifications
 * Allowed: seller, admin
 */
export const canManagePushNotifications = allowRoles("seller", "admin");

/**
 * canManageCatalog
 * Catalog view (read) is allowed for product_manager too;
 * use canDeleteProduct for destructive catalog ops.
 * Allowed: seller, admin, product_manager
 */
export const canViewCatalog = allowRoles("seller", "admin", "product_manager");

// ════════════════════════════════════════════════════════════════
//  Utility: attach actor info to res.locals so route handlers
//  can always read `res.locals.sellerId` and `res.locals.role`
//  without calling resolveActor themselves.
//
//  Add this ONCE in your main seller router:
//    sellerRouter.use(attachActor);
// ════════════════════════════════════════════════════════════════
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
