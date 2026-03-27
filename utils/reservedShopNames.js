// Reserved shop names that cannot be used by sellers
// These names conflict with application routes and would cause routing issues

export const RESERVED_SHOP_NAMES = [
  // Preview shop route
  "your-shop-name",
  // Customer root routes
  "login",
  "register",
  "oauth-success",
  "about-us",
  "terms",
  "privacy",
  "faq",
  "contact",
  "privacy-policy",
  "terms-and-conditions",
  "data-deletion",
  "contact-us",
  "pricing",
  "questions",
  "complete-profile",
  // Admin routes
  "secure-control-panel",
  "admin",
  // API and system routes
  "api",
  "uploads",
  "static",
  "assets",
  // Common reserved words
  "www",
  "mail",
  "ftp",
  "smtp",
  "support",
  "help",
  "blog",
  "news",
  "null"
];

/**
 * Check if a shop name is reserved
 * @param {string} shopName - The shop name to check
 * @returns {boolean} - True if the name is reserved
 */
export const isReservedShopName = (shopName) => {
  if (!shopName) return false;
  const normalizedName = shopName.toLowerCase().trim();
  return RESERVED_SHOP_NAMES.some(
    (reserved) => reserved.toLowerCase() === normalizedName,
  );
};
