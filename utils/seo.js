const DEFAULT_ORIGIN = "https://dwkanlink.com";
const DEFAULT_IMAGE_ORIGIN = "https://images.dwkanlink.com";
const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "admin", "static", "assets", "uploads", "mail", "ftp",
  "smtp", "support", "help", "blog", "news",
]);

function normalizeHost(host = "") {
  return String(host).trim().toLowerCase().split(":")[0].replace(/\.$/, "");
}

export function getCleanHost(req) {
  return normalizeHost(req?.headers?.host || req?.get?.("host") || "");
}

export function getSubdomain(host, baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com") {
  const hostname = normalizeHost(host);
  const base = normalizeHost(baseDomain);
  if (!hostname.endsWith(`.${base}`)) return null;
  const subdomain = hostname.slice(0, -(base.length + 1));
  return subdomain && !subdomain.includes(".") ? subdomain : null;
}

export function isMainDomain(host, baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com") {
  const hostname = normalizeHost(host);
  const base = normalizeHost(baseDomain);
  return hostname === base || hostname === `www.${base}`;
}

export function getShopNameFromHost(host, baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com") {
  const hostname = normalizeHost(host);
  const base = normalizeHost(baseDomain);
  if (isMainDomain(hostname, base)) return null;
  const shopName = getSubdomain(hostname, base);
  if (!shopName || RESERVED_SUBDOMAINS.has(shopName) || !/^[a-z0-9_-]+$/.test(shopName)) return null;
  return shopName;
}

export function isShopSubdomain(host, baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com") {
  return Boolean(getShopNameFromHost(host, baseDomain));
}

export const isValidShopSubdomain = isShopSubdomain;

export function stripHtml(value = "") {
  return String(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateMetaDescription(value, maxLength = 160) {
  const text = stripHtml(value);
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.65 ? shortened.slice(0, lastSpace) : shortened).trim()}…`;
}

export function getAbsoluteImageUrl(value, fallback = "/og-default.png") {
  const imageOrigin = (process.env.R2_PUBLIC_URL || DEFAULT_IMAGE_ORIGIN).replace(/\/$/, "");
  const backendOrigin = (process.env.BACKEND_URL || DEFAULT_ORIGIN).replace(/\/$/, "");
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");
  const image = value || fallback;
  if (/^https?:\/\//i.test(image)) return image;
  if (/^\/?uploads\//i.test(image)) return `${backendOrigin}/${image.replace(/^\//, "")}`;
  if (image.startsWith("/")) return `${frontendOrigin}${image}`;
  return `${imageOrigin}/${image.replace(/^\//, "")}`;
}

function productImages(product) {
  const records = Array.isArray(product?.productImages) ? [...product.productImages] : [];
  records.sort((a, b) => Number(Boolean(b.is_main)) - Number(Boolean(a.is_main)));
  const values = records.map((item) => item.image_key);
  if (!values.length && Array.isArray(product?.images)) values.push(...product.images);
  return [...new Set(values.filter(Boolean).map((image) => getAbsoluteImageUrl(image)))];
}

function localized(primary, secondary, fallback = "") {
  return stripHtml(primary || secondary || fallback);
}

function inStock(product) {
  if (product?.isAvailable === false) return false;
  const variants = [product?.variantPrices, product?.variantPricesAr].find(Array.isArray) || [];
  if (variants.length) return variants.some((variant) => variant?.stock == null || Number(variant.stock) > 0);
  return product?.stock == null || Number(product.stock) > 0;
}

function effectivePrice(product) {
  const raw = Number(product?.realPrice ?? 0);
  return product?.hasDiscount && Number(product?.discount_percent) > 0
    ? raw * (1 - Number(product.discount_percent) / 100)
    : raw;
}

export function buildProductSeo(product, seller) {
  const shopName = stripHtml(seller?.shop_name || seller?.name || "Shop");
  const productTitle = localized(product?.titleKu, product?.titleAr, `Product ${product?.id || ""}`);
  const description = truncateMetaDescription(
    localized(product?.descriptionKu, product?.descriptionAr, `${productTitle} from ${shopName}`),
  );
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const canonicalUrl = `https://${seller.shop_name}.${baseDomain}/p/${product.id}`;
  const images = productImages(product);
  if (!images.length) images.push(getAbsoluteImageUrl(null));
  return {
    title: `${productTitle} | ${shopName}`,
    ogTitle: productTitle,
    description,
    canonicalUrl,
    image: images[0],
    images,
    type: "product",
    jsonLd: buildJsonLd("product", {
      product, shopName, productTitle, description, canonicalUrl, images,
    }),
  };
}

export function buildShopSeo(seller) {
  const shopName = stripHtml(seller?.display_name || seller?.shop_name || seller?.name || "Shop");
  const description = truncateMetaDescription(seller?.seo_description || seller?.bio || `Shop online from ${shopName} on Dwkan Link.`);
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const canonicalUrl = `https://${seller.shop_name}.${baseDomain}/`;
  const image = getAbsoluteImageUrl(seller?.shop_image);
  return {
    title: `${shopName} | Dwkan Link`, ogTitle: shopName,
    description, canonicalUrl, image, type: "website",
    jsonLd: buildJsonLd("shop", { shopName, description, canonicalUrl, image }),
  };
}

export const buildShopHomeSeo = buildShopSeo;

export function buildJsonLd(type, data) {
  if (type === "product") {
    const currency = data.product?.priceType === "USD" ? "USD" : "IQD";
    return {
      "@context": "https://schema.org", "@type": "Product",
      name: data.productTitle, description: data.description, image: data.images,
      sku: String(data.product.id), brand: { "@type": "Brand", name: data.shopName },
      offers: {
        "@type": "Offer", price: effectivePrice(data.product).toFixed(2),
        priceCurrency: currency,
        availability: `https://schema.org/${inStock(data.product) ? "InStock" : "OutOfStock"}`,
        url: data.canonicalUrl,
      },
    };
  }
  return {
    "@context": "https://schema.org", "@type": "Store", name: data.shopName,
    description: data.description, image: data.image, logo: data.image, url: data.canonicalUrl,
  };
}

export function getProductImageUrls(product) {
  return productImages(product);
}
