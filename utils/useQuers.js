import { useQuery } from "@tanstack/react-query";
import {
  getProduct,
  getCartProducts,
} from "../services/customer/product.C.jsx";
import { getQuestions } from "../services/customer/questions.C.jsx";
import {
  getSellerCustomerData,
  getSellerCategoryData,
  getShopDiscountProducts,
} from "../services/seller/sellersCustomer.jsx";
import { getOfferDetail } from "../services/seller/offer.jsx";
import { getSellerProfile } from "../services/seller/profile.S.jsx";
import {
  getSellerDashboard,
  getSellerAnalytics,
} from "../services/seller/dashboard.jsx";
import { getProductsByShopName } from "../services/seller/product.jsx";
import { getProductsByCategory } from "../services/seller/category.jsx";
import { useStaffPermission } from "./useStaffPermission.js";

// Cache times
const USER_STALE_TIME = 3 * 60 * 1000; // 3 minutes for regular users
const USER_CACHE_TIME = 3 * 60 * 1000; // 3 minutes cache
const QUESTIONS_STALE_TIME = 10 * 60 * 1000; // 10 minutes for questions
const QUESTIONS_CACHE_TIME = 10 * 60 * 1000; // 10 minutes cache for questions

/**
 * Hook for fetching product details
 * - Cache for 5 minutes for all users (sellers and customers)
 */
export function useProductDetail(productId, shopName, options = {}) {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const data = await getProduct(productId, shopName);
      return data;
    },
    enabled: !!productId,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching seller/shop home page data
 * - For shop visitors: cache for 5 minutes
 * - Data includes seller info, products, offers
 */
export function useShopHome(shopName, options = {}) {
  return useQuery({
    queryKey: ["shopHome", shopName],
    queryFn: async () => {
      const data = await getSellerCustomerData(shopName);
      return data;
    },
    enabled: !!shopName,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Lightweight hook for CategoryPage — fetches only categories + plan check.
 * Does NOT fetch products, offers, or red_line.
 */
export function useShopCategory(shopName, options = {}) {
  return useQuery({
    queryKey: ["shopCategory", shopName],
    queryFn: async () => {
      const data = await getSellerCategoryData(shopName);
      return data;
    },
    enabled: !!shopName,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching offer details
 * - Cache for 5 minutes for all users
 */
export function useOfferDetail(offerId, options = {}) {
  return useQuery({
    queryKey: ["offer", offerId],
    queryFn: async () => {
      const data = await getOfferDetail(offerId);
      return data;
    },
    enabled: !!offerId,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching seller profile
 * - Cache for 5 minutes
 */
export function useSellerProfile(shopName, options = {}) {
  return useQuery({
    queryKey: ["sellerProfile", shopName],
    queryFn: async () => {
      const data = await getSellerProfile(shopName);
      return data;
    },
    enabled: !!shopName,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching seller dashboard data
 * - Cache for 5 minutes
 * - Dashboard includes products, offers, red line, limits
 * - The dashboard route is what fills the shop-editing pages (products,
 *   categories, hero, red line), so it is gated on dashboard access, NOT on
 *   viewAnalytics. Waits for permissions to finish loading before deciding.
 */
export function useSellerDashboardQuery(options = {}) {
  const perm = useStaffPermission();
  const canLoadDashboard =
    !perm.isLoading &&
    perm.hasAnyPermission("accessDashboard", "manageShopSections");
  const enabled = (options.enabled ?? true) && canLoadDashboard;

  return useQuery({
    queryKey: ["sellerDashboard"],
    queryFn: async () => {
      const data = await getSellerDashboard();
      return data;
    },
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
    enabled,
  });
}

/**
 * Hook for fetching seller analytics (Orders, Today's Sales, Visitors, top products)
 * - Backs the dashboard KPI row and the Reports page
 * - Gated on viewAnalytics, matching the backend route's own permission check,
 *   so it never fires a request that would just 403
 */
export function useSellerAnalyticsQuery(options = {}) {
  const perm = useStaffPermission();
  const canLoadAnalytics = !perm.isLoading && perm.can.viewAnalytics;
  const enabled = (options.enabled ?? true) && canLoadAnalytics;

  return useQuery({
    queryKey: ["sellerAnalytics"],
    queryFn: async () => {
      const data = await getSellerAnalytics();
      return data;
    },
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
    enabled,
  });
}

/**
 * Hook for fetching cart products with full data
 * - Sends product IDs to backend, gets full product + offers + seller data
 */
export function useCartProducts(productIds, options = {}) {
  return useQuery({
    queryKey: ["cartProducts", productIds],
    queryFn: async () => {
      const data = await getCartProducts(productIds);
      return data;
    },
    enabled: productIds && productIds.length > 0,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching seller products by shop name (for offer pages)
 * - Cached so add-offer & edit-offer share the same data
 * - Supports pagination with offset param
 */
export function useShopProducts(
  shopName,
  { limit = 50, offset = 0 } = {},
  options = {},
) {
  return useQuery({
    queryKey: ["shopProducts", shopName, limit, offset],
    queryFn: async () => {
      const data = await getProductsByShopName(shopName, { limit, offset });
      return data;
    },
    enabled: !!shopName,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching FAQ questions from database
 * - Long cache time (30 min stale, 1 hour cache) since questions rarely change
 * - Used by both customer and seller FAQ pages
 */
export function useQuestions(options = {}) {
  return useQuery({
    queryKey: ["questions"],
    queryFn: async () => {
      const data = await getQuestions();
      return data;
    },
    staleTime: QUESTIONS_STALE_TIME,
    gcTime: QUESTIONS_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook for fetching products filtered by category for a specific seller.
 * - Each (sellerId, category) pair is cached independently.
 * - One request per unique category — subsequent clicks use the cache.
 * - staleTime = 5 min so the data stays fresh without hammering the backend.
 */
export function useProductsByCategory(sellerId, category, options = {}) {
  return useQuery({
    queryKey: ["productsByCategory", sellerId, category],
    queryFn: async () => {
      const data = await getProductsByCategory(sellerId, {
        category,
        limit: 30,
        offset: 0,
      });
      return data;
    },
    enabled: !!sellerId && !!category,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}

/**
 * Hook to fetch discount / free-delivery products for a shop.
 * type: "all" | "expiring_soon" | "both" | "discount_only" | "free_delivery_only"
 * When type="all" the result contains expiringSoon, both, discountOnly, freeDeliveryOnly arrays.
 */
export function useShopDiscountProducts(shopName, type = "all", options = {}) {
  return useQuery({
    queryKey: ["shopDiscountProducts", shopName, type],
    queryFn: async () => {
      const data = await getShopDiscountProducts(shopName, {
        type,
        limit: 5,
        offset: 0,
      });
      return data;
    },
    enabled: !!shopName,
    staleTime: USER_STALE_TIME,
    gcTime: USER_CACHE_TIME,
    ...options,
  });
}
