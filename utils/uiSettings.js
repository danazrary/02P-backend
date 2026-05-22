export const DEFAULT_UI_SETTINGS = {
  flashDiscountBanner: {
    enabled: true,
    fontSize: 22,
    width: 100,
    height: 72,
    pages: {
      home: true,
      productDetails: true,
      dashboard: true,
      category: true,
      search: true,
      profile: true,
    },
  },
  discountsSection: {
    enabled: true,
  },
  heroSection: {
    enabled: false,
    imageKey: null,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePages(rawPages) {
  const src = rawPages || {};
  const defaults = DEFAULT_UI_SETTINGS.flashDiscountBanner.pages;
  return {
    home: src.home !== undefined ? Boolean(src.home) : defaults.home,
    productDetails:
      src.productDetails !== undefined
        ? Boolean(src.productDetails)
        : defaults.productDetails,
    dashboard:
      src.dashboard !== undefined ? Boolean(src.dashboard) : defaults.dashboard,
    category: src.category !== undefined ? Boolean(src.category) : defaults.category,
    search: src.search !== undefined ? Boolean(src.search) : defaults.search,
    profile: src.profile !== undefined ? Boolean(src.profile) : defaults.profile,
  };
}

export function normalizeUiSettings(raw) {
  const src = raw || {};
  const flash = src.flashDiscountBanner || {};
  const discounts = src.discountsSection || {};
  const hero = src.heroSection || {};

  return {
    flashDiscountBanner: {
      enabled:
        flash.enabled !== undefined
          ? Boolean(flash.enabled)
          : DEFAULT_UI_SETTINGS.flashDiscountBanner.enabled,
      fontSize: clamp(
        toNumber(flash.fontSize, DEFAULT_UI_SETTINGS.flashDiscountBanner.fontSize),
        14,
        40,
      ),
      width: clamp(
        toNumber(flash.width, DEFAULT_UI_SETTINGS.flashDiscountBanner.width),
        60,
        100,
      ),
      height: clamp(
        toNumber(flash.height, DEFAULT_UI_SETTINGS.flashDiscountBanner.height),
        50,
        180,
      ),
      pages: normalizePages(flash.pages),
    },
    discountsSection: {
      enabled:
        discounts.enabled !== undefined
          ? Boolean(discounts.enabled)
          : DEFAULT_UI_SETTINGS.discountsSection.enabled,
    },
    heroSection: {
      enabled:
        hero.enabled !== undefined
          ? Boolean(hero.enabled)
          : DEFAULT_UI_SETTINGS.heroSection.enabled,
      imageKey:
        typeof hero.imageKey === "string" && hero.imageKey.trim()
          ? hero.imageKey
          : null,
    },
  };
}
