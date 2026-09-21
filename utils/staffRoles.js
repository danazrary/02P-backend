// backend/utils/staffRoles.js
//
// ════════════════════════════════════════════════════════════════
//  SINGLE SOURCE OF TRUTH for staff roles and permissions
// ════════════════════════════════════════════════════════════════
//
//  To add a new role later you only edit THIS file:
//    1. add an entry to STAFF_ROLES
//    2. (optional) add new permission keys to PERMISSION_KEYS
//
//  Nothing else has to change:
//    - staff login / add / change-role validate against STAFF_ROLES
//    - the auth middleware reads the role's permissions from here
//    - /check-me sends the permission list to the frontend, and the
//      frontend `can.<permission>` map is built from that list
//    - GET /api/seller/staff/roles feeds the role dropdown in StaffManager
//
//  Typos are caught at server start: a role that uses an unknown permission
//  (or an owner-only permission) makes this module throw.

export const OWNER_ROLE = "seller";

// Every permission the platform knows about.
export const PERMISSION_KEYS = Object.freeze([
  // access to areas
  "accessDashboard",
  "usePOS",
  // products
  "addProduct",
  "editProduct",
  "deleteProduct",
  "viewCatalog",
  "bulkCategory",
  "stock-manager",
  // promotions
  "manageDiscount",
  // storefront content
  "manageCategories",
  "manageShopSections",
  "manageRedLine",
  // orders / customers / analytics
  "viewOrders",
  "updateOrderStatus",
  "viewAnalytics",
  "manageCustomers",
  // settings
  "manageSettings",
  "managePushNotifications",
  // owner only (can never be given to staff)
  "changeShopIdentity",
  "manageStaff",
  "deleteAccount",
  "viewPricing",
  "completeProfile",
]);

export const OWNER_ONLY_PERMISSIONS = Object.freeze([
  "changeShopIdentity",
  "manageStaff",
  "deleteAccount",
  "viewPricing",
  "completeProfile",
]);

// Staff roles that a shop owner can assign.
//   permissions: list of permission keys, "*" = every permission that is not owner-only
//   except:      (optional) permissions removed after "*" is expanded
//   homePage:    where the frontend sends this role after login (buildShopPath page name)
export const STAFF_ROLES = Object.freeze({
  admin: {
    label: "بەڕێوەبەر",
    emoji: "🛡️",
    hint: "دەسەڵاتی تەواو",
    homePage: "dashboard",
    permissions: ["*"],
  },
  product_manager: {
    label: "بەڕێوەبەری کاڵا",
    emoji: "📦",
    hint: "زیادکردن و دەستکاری کاڵا",
    homePage: "dashboard",
    permissions: [
      "accessDashboard",
      "addProduct",
      "editProduct",
      "viewCatalog",
      "bulkCategory",

    ],
  },
  shop_editor: {
    label: "دەستکاری فرۆشگا",
    emoji: "🎨",
    hint: "سێکشن و کاتیگۆری و هێڵی سووری",
    homePage: "dashboard",
    permissions: [
      "accessDashboard",
      "manageCategories",
      "manageShopSections",
      "manageRedLine",
    ],
  },
  cashier: {
    label: "کاشیر",
    emoji: "💳",
    hint: "تەنها POS و فرۆشتن",
    homePage: "pos",
    permissions: ["usePOS"],
  },

  // ── Example of a future role (uncomment to enable) ─────────────
  // warehouse: {
  //   label: "کۆگا",
  //   emoji: "🏬",
  //   hint: "بینینی کاتالۆگ و ئۆردەرەکان",
  //   homePage: "dashboard",
  //   permissions: ["accessDashboard", "viewCatalog", "viewOrders"],
  // },
});

export const OWNER_META = Object.freeze({
  key: OWNER_ROLE,
  label: "خاوەنی فرۆشگا",
  emoji: "👑",
  hint: "",
  home_page: "dashboard",
});

// ────────────────────────────────────────────────────────────────
//  Registry compilation (runs once at startup)
// ────────────────────────────────────────────────────────────────
const KNOWN = new Set(PERMISSION_KEYS);
const OWNER_ONLY = new Set(OWNER_ONLY_PERMISSIONS);

function expandPermissions(roleKey, definition) {
  const granted = new Set();

  for (const permission of definition.permissions || []) {
    if (permission === "*") {
      PERMISSION_KEYS.filter((key) => !OWNER_ONLY.has(key)).forEach((key) =>
        granted.add(key),
      );
    } else if (KNOWN.has(permission)) {
      granted.add(permission);
    } else {
      throw new Error(
        `[staffRoles] Role "${roleKey}" uses unknown permission "${permission}"`,
      );
    }
  }

  for (const permission of definition.except || []) {
    if (!KNOWN.has(permission)) {
      throw new Error(
        `[staffRoles] Role "${roleKey}" excludes unknown permission "${permission}"`,
      );
    }
    granted.delete(permission);
  }

  for (const permission of granted) {
    if (OWNER_ONLY.has(permission)) {
      throw new Error(
        `[staffRoles] Owner-only permission "${permission}" cannot be given to staff role "${roleKey}"`,
      );
    }
  }

  return Object.freeze([...granted]);
}

const PERMISSIONS_BY_ROLE = new Map();
PERMISSIONS_BY_ROLE.set(OWNER_ROLE, Object.freeze([...PERMISSION_KEYS]));

for (const [roleKey, definition] of Object.entries(STAFF_ROLES)) {
  if (roleKey === OWNER_ROLE) {
    throw new Error(
      `[staffRoles] "${OWNER_ROLE}" is reserved for the shop owner`,
    );
  }
  PERMISSIONS_BY_ROLE.set(roleKey, expandPermissions(roleKey, definition));
}

export const STAFF_ROLE_KEYS = Object.freeze(Object.keys(STAFF_ROLES));

// ────────────────────────────────────────────────────────────────
//  Public helpers
// ────────────────────────────────────────────────────────────────

/** True when `role` is a role a shop owner can assign to staff. */
export function isStaffRole(role) {
  return (
    typeof role === "string" &&
    Object.prototype.hasOwnProperty.call(STAFF_ROLES, role)
  );
}

export function isKnownPermission(permission) {
  return KNOWN.has(permission);
}

/** Permission keys granted to a role ("seller" = everything, unknown role = nothing). */
export function getPermissionsForRole(role) {
  return PERMISSIONS_BY_ROLE.get(role) ?? [];
}

export function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

/** Display data for a role, in the shape the frontend receives (`role_meta`). */
export function getRoleMeta(role) {
  if (role === OWNER_ROLE) return OWNER_META;
  if (!isStaffRole(role)) return null;

  const definition = STAFF_ROLES[role];
  return {
    key: role,
    label: definition.label,
    emoji: definition.emoji,
    hint: definition.hint || "",
    home_page: definition.homePage || "dashboard",
  };
}

/** Roles an owner can pick in the "add staff" / "change role" forms. */
export function listStaffRoles() {
  return STAFF_ROLE_KEYS.map((key) => ({
    ...getRoleMeta(key),
    permissions: getPermissionsForRole(key),
  }));
}
