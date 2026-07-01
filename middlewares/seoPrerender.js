import fs from "fs";
import path from "path";
import Seller from "../database/seller.js";
import Product from "../database/products.js";
import ProductImage from "../database/productImages.js";
import { RESERVED_SHOP_NAMES } from "../utils/reservedShopNames.js";
import { getCategoryLabel, getCategoryMap, getSubcategoryLabel } from "../utils/categoryTranslations.js";
import { buildProductSeo, buildShopHomeSeo, getAbsoluteImageUrl, getCleanHost, getShopNameFromHost, isMainDomain, isValidShopSubdomain, stripHtml, truncateMetaDescription } from "../utils/seo.js";

const BOT_AGENTS = /googlebot|google-inspectiontool|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|applebot|semrushbot|ahrefsbot|pinterest|discordbot|petalbot|bytespider/i;
const RESERVED = new Set(RESERVED_SHOP_NAMES.map((name) => name.toLowerCase()));
const PRODUCT_INCLUDE = [{ model: ProductImage, as: "productImages", attributes: ["image_key", "thumb_key", "is_main"], required: false }];

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function seoTags(seo) {
  return `<title>${escapeHtml(seo.title)}</title>
<meta name="description" content="${escapeHtml(seo.description)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}">
<meta property="og:type" content="${seo.type}">
<meta property="og:title" content="${escapeHtml(seo.ogTitle)}">
<meta property="og:description" content="${escapeHtml(seo.description)}">
<meta property="og:image" content="${escapeHtml(seo.image)}">
<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}">
<meta property="og:site_name" content="Dwkan Link">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(seo.ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(seo.description)}">
<meta name="twitter:image" content="${escapeHtml(seo.image)}">
<script type="application/ld+json">${safeJson(seo.jsonLd)}</script>`;
}

let indexTemplate;
function getIndexTemplate() {
  if (indexTemplate) return indexTemplate;
  const configuredPath = process.env.FRONTEND_DIST_PATH
    ? path.resolve(process.env.FRONTEND_DIST_PATH, "index.html")
    : null;
  const candidates = [
    configuredPath,
    path.join(process.cwd(), "..", "frontend", "dist", "index.html"),
    path.join(process.cwd(), "frontend", "dist", "index.html"),
    path.join(process.cwd(), "..", "frontend", "index.html"),
    path.join(process.cwd(), "frontend", "index.html"),
  ].filter(Boolean);
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(
      `Frontend index.html not found. Set FRONTEND_DIST_PATH (expected ${configuredPath || "/var/www/02P-frontend/dist/index.html"}).`,
    );
  }
  indexTemplate = fs.readFileSync(file, "utf8");
  if (!/<\/head>/i.test(indexTemplate) || !/<div\s+id=["']root["'][^>]*>/i.test(indexTemplate)) {
    throw new Error(`Invalid Vite index template: ${file}`);
  }
  return indexTemplate;
}

export function injectSeoIntoHtml(seo, visibleHtml = "") {
  let html = getIndexTemplate();
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "");
  html = html.replace(/<meta\s+(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");
  html = html.replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<\/head>/i, `${seoTags(seo)}\n</head>`);
  const crawlable = `<noscript><main>${visibleHtml}</main></noscript>`;
  return html.replace(/<div\s+id=["']root["'][^>]*><\/div>/i, (root) => `${root}${crawlable}`);
}

function sendHtml(res, status, html, cacheControl = "no-cache, no-store, must-revalidate") {
  return res
    .status(status)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", cacheControl)
    .set("Vary", "Host")
    .set("X-Content-Type-Options", "nosniff")
    .send(html);
}

function errorHtml(title, description) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="noindex,follow"></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></main></body></html>`;
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06ff-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function findBySlug(map, slug) {
  return Object.keys(map || {}).find((key) => slugify(key) === slug) || null;
}

function categorySeo(seller, categoryName, subcategoryName, requestSlug) {
  const label = subcategoryName ? `${subcategoryName} - ${categoryName}` : categoryName;
  const shopName = stripHtml(seller.shop_name);
  const canonicalUrl = `https://${seller.shop_name}.${process.env.BASE_DOMAIN || "dwkanlink.com"}/c/${requestSlug}`;
  const description = truncateMetaDescription(`Browse ${label} products from ${shopName}.`);
  const image = getAbsoluteImageUrl(seller.shop_image);
  return {
    title: `${label} | ${shopName} - Dwkan Link`, ogTitle: `${label} - ${shopName}`,
    description, canonicalUrl, image, type: "website",
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: label, description, url: canonicalUrl, isPartOf: `https://${seller.shop_name}.${process.env.BASE_DOMAIN || "dwkanlink.com"}/` },
  };
}

function productLinks(products, seller, includeDescriptions = false) {
  return products.map((product) => {
    const title = stripHtml(product.titleKu || product.titleAr || `Product ${product.id}`);
    const description = stripHtml(product.descriptionKu || product.descriptionAr || "");
    return `<article><a href="https://${escapeHtml(seller.shop_name)}.${process.env.BASE_DOMAIN || "dwkanlink.com"}/p/${product.id}"><h2>${escapeHtml(title)}</h2></a>${includeDescriptions && description ? `<p>${escapeHtml(description)}</p>` : ""}</article>`;
  }).join("");
}

async function renderShop(res, seller) {
  const products = await Product.findAll({ where: { seller_id: seller.id }, attributes: ["id", "titleKu", "titleAr"], order: [["updatedAt", "DESC"]], limit: 80 });
  const seo = buildShopHomeSeo(seller);
  return sendHtml(res, 200, injectSeoIntoHtml(seo, `<h1>${escapeHtml(seo.ogTitle)}</h1><p>${escapeHtml(seo.description)}</p>${productLinks(products, seller)}`));
}

async function renderProduct(res, seller, productId) {
  const product = await Product.findOne({ where: { id: productId, seller_id: seller.id }, include: PRODUCT_INCLUDE });
  if (!product) return res.status(404).type("html").send("<!doctype html><title>Product not found</title><meta name=\"robots\" content=\"noindex\"><h1>Product not found</h1>");
  const seo = buildProductSeo(product, seller);
  return res.type("html").send(injectSeoIntoHtml(seo, `<h1>${escapeHtml(seo.ogTitle)}</h1><img src="${escapeHtml(seo.image)}" alt="${escapeHtml(`${seo.ogTitle} - ${seller.shop_name}`)}"><p>${escapeHtml(seo.description)}</p>`));
}

async function renderCategory(res, seller, categorySlug, subcategorySlug) {
  const map = getCategoryMap(seller);
  const categoryKey = findBySlug(map, categorySlug);
  const category = categoryKey && map[categoryKey];
  const subcategoryKey = subcategorySlug && findBySlug(category?.subcategories, subcategorySlug);
  if (!category || (subcategorySlug && !subcategoryKey)) return res.status(404).type("html").send("<!doctype html><title>Category not found</title><meta name=\"robots\" content=\"noindex\"><h1>Category not found</h1>");
  const categoryName = getCategoryLabel(category, categoryKey, seller.default_shop_lang);
  const subcategoryName = subcategoryKey ? getSubcategoryLabel(category.subcategories[subcategoryKey], subcategoryKey, seller.default_shop_lang) : null;
  const products = await Product.findAll({
    where: { seller_id: seller.id, category: categoryKey, ...(subcategoryKey ? { subcategory: subcategoryKey } : {}) },
    attributes: ["id", "titleKu", "titleAr", "descriptionKu", "descriptionAr"], order: [["updatedAt", "DESC"]], limit: 80,
  });
  const seo = categorySeo(seller, categoryName, subcategoryName, [categorySlug, subcategorySlug].filter(Boolean).join("/"));
  return res.type("html").send(injectSeoIntoHtml(seo, `<h1>${escapeHtml(seo.ogTitle)}</h1><p>${escapeHtml(seo.description)}</p>${productLinks(products, seller, true)}`));
}

function mainSiteSeo() {
  const canonicalUrl = `https://${process.env.BASE_DOMAIN || "dwkanlink.com"}/`;
  const description = truncateMetaDescription(
    "Create your online shop and sell products with Dwkan Link.",
  );
  const image = getAbsoluteImageUrl(null);
  return {
    title: "Dwkan Link", ogTitle: "Dwkan Link", description, canonicalUrl,
    image, type: "website",
    jsonLd: {
      "@context": "https://schema.org", "@type": "Organization",
      name: "Dwkan Link", description, url: canonicalUrl, logo: image, image,
    },
  };
}

export async function serveHomepageSeo(req, res) {
  const host = getCleanHost(req);
  try {
    if (isMainDomain(host)) {
      return sendHtml(res, 200, injectSeoIntoHtml(mainSiteSeo(), "<h1>Dwkan Link</h1>"));
    }

    if (!isValidShopSubdomain(host)) {
      return sendHtml(res, 404, errorHtml("Shop Not Found", "The requested shop does not exist."));
    }
    const shopName = getShopNameFromHost(host);

    const seller = await Seller.findOne({ where: { shop_name: shopName } });
    if (!seller) {
      return sendHtml(res, 404, errorHtml("Shop Not Found", "The requested shop does not exist."));
    }

    return renderShop(res, seller);
  } catch (error) {
    console.error("Shop homepage SEO failed:", error);
    return sendHtml(
      res,
      500,
      errorHtml("Page Unavailable", "The shop page is temporarily unavailable."),
    );
  }
}

export default async function seoPrerender(req, res, next) {
  if (req.method !== "GET" || !BOT_AGENTS.test(req.get("user-agent") || "")) return next();
  const parts = req.path.split("/").filter(Boolean);
  let shopName = req.shopName;
  let route = parts;
  if (!shopName && parts[0] && !RESERVED.has(parts[0].toLowerCase()) && !parts[0].includes(".")) {
    shopName = parts[0]; route = parts.slice(1);
  }
  if (!shopName) return next();
  try {
    const seller = await Seller.findOne({ where: { shop_name: shopName } });
    if (!seller) return next();
    if (route.length === 0 || (route.length === 1 && route[0] === "profile")) return renderShop(res, seller);
    if (route.length === 2 && route[0] === "p") return renderProduct(res, seller, route[1]);
    if (route[0] === "c" && (route.length === 2 || route.length === 3)) return renderCategory(res, seller, route[1], route[2]);
    return next();
  } catch (error) {
    console.error("SEO prerender failed:", error);
    return next();
  }
}
