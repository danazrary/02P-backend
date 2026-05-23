import Seller from "../database/seller.js";
import Product from "../database/products.js";
import { RESERVED_SHOP_NAMES } from "../utils/reservedShopNames.js";

const BOT_AGENTS =
  /googlebot|google-inspectiontool|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|applebot|semrushbot|ahrefsbot|pinterest|discordbot|petalbot|bytespider/i;

const RESERVED = new Set([
  ...RESERVED_SHOP_NAMES.map((n) => n.toLowerCase()),
  "sitemap.xml",
  "robots.txt",
  "manifest.json",
  "favicon.ico",
  "sw.js",
  "health",
  "test",
  "csrf-token",
  "protected",
  "profile",
  "forgot-password",
  "verify-code",
  "reset-password",
]);

const SITE_NAME = "dwkanlink | دوکان لینک";

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imgUrl(image, type) {
  const backend = process.env.BACKEND_URL || "";
  const frontend = process.env.FRONTEND_ORIGIN || "https://dwkanlink.com";
  const r2PublicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!image) return `${frontend}/og-default.png`;
  if (image.startsWith("http")) return image;
  if (image.startsWith("/uploads/") || image.startsWith("uploads/")) {
    const normalizedPath = image.startsWith("/") ? image : `/${image}`;
    return `${backend}${normalizedPath}`;
  }
  return `${r2PublicUrl}/${image}`;
}

function shopHtml(seller, products = []) {
  const name = esc(seller.shop_name || seller.name || "");
  const frontend = process.env.FRONTEND_ORIGIN || "https://dwkanlink.com";
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const url = `https://${seller.shop_name}.${baseDomain}`;
  const image = imgUrl(seller.shop_image, "sellers");
  const desc = esc(
    `کڕینی کاڵاکان لە ${seller.shop_name} بە باشترین نرخ و کوالیتی | تسوق من ${seller.shop_name} واحصل على أفضل الأسعار`,
  );

  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Store",
    name: seller.shop_name,
    image,
    url,
  });

  const productLinks = Array.isArray(products)
    ? products
        .filter((p) => p && p.id)
        .slice(0, 80)
        .map((p) => {
          const pTitle = esc(p.titleKu || p.titleAr || `Product ${p.id}`);
          return `<li><a href="${url}/p/${p.id}">${pTitle}</a></li>`;
        })
        .join("\n")
    : "";

  return `<!DOCTYPE html>
<html lang="ku" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} - ${SITE_NAME}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${name} - ${SITE_NAME}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="ku_IQ">
<meta property="og:locale:alternate" content="ar_IQ">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${name} - ${SITE_NAME}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<h1>${name}</h1>
<p>${desc}</p>
${productLinks ? `<h2>Products</h2><ul>${productLinks}</ul>` : ""}
</body>
</html>`;
}

function productHtml(product, seller) {
  const shopName = esc(seller.shop_name || "");
  const title = esc(product.titleKu || product.titleAr || "");
  const desc = esc(
    product.descriptionKu ||
      product.descriptionAr ||
      `${product.titleKu || product.titleAr || ""} - ${seller.shop_name}`,
  );
  const frontend = process.env.FRONTEND_ORIGIN || "https://dwkanlink.com";
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const url = `https://${seller.shop_name}.${baseDomain}/p/${product.id}`;
  const images = product.images;
  const image =
    Array.isArray(images) && images.length
      ? imgUrl(images[0], "products")
      : `${frontend}/og-default.png`;
  const currency = product.priceType === "IQD" ? "IQD" : "USD";
  const price =
    product.hasDiscount && product.discount_percent
      ? (product.realPrice * (1 - product.discount_percent / 100)).toFixed(2)
      : product.realPrice;

  const ld = JSON.stringify({
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.titleKu || product.titleAr || "",
    description: product.descriptionKu || product.descriptionAr || "",
    image,
    brand: { "@type": "Brand", name: seller.shop_name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currency,
      price: String(price ?? ""),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: seller.shop_name },
    },
  });

  return `<!DOCTYPE html>
<html lang="ku" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - ${shopName} - ${SITE_NAME}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${title} - ${shopName}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="ku_IQ">
<meta property="og:locale:alternate" content="ar_IQ">
<meta property="product:price:amount" content="${price ?? ""}">
<meta property="product:price:currency" content="${currency}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title} - ${shopName}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<h1>${title}</h1>
<p>${desc}</p>
${price ? `<p>${price} ${currency}</p>` : ""}
</body>
</html>`;
}

function notFoundHtml(title, description) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="robots" content="noindex,follow">
</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
</body>
</html>`;
}

export default function seoPrerender(req, res, next) {
  if (
    req.method !== "GET" ||
    !BOT_AGENTS.test(req.headers["user-agent"] || "")
  ) {
    return next();
  }

  const parts = req.path.split("/").filter(Boolean);

  // --- Subdomain-based routes (new format) ---
  // shopName is extracted from req.shopName (set by subdomain middleware)
  if (req.shopName) {
    const shopNameFromSub = req.shopName;

    // / (shop home on subdomain)
    if (parts.length === 0) {
      return Seller.findOne({ where: { shop_name: shopNameFromSub } })
        .then(async (s) => {
          if (!s) return next();

          const products = await Product.findAll({
            where: { seller_id: s.id },
            attributes: ["id", "titleKu", "titleAr"],
            order: [["updatedAt", "DESC"]],
            limit: 80,
          });

          res.set("Content-Type", "text/html; charset=utf-8");
          res.send(shopHtml(s, products));
        })
        .catch(() => next());
    }

    // /profile (on subdomain)
    if (parts.length === 1 && parts[0] === "profile") {
      return Seller.findOne({ where: { shop_name: shopNameFromSub } })
        .then((s) => {
          if (!s) {
            res.status(404);
            res.set("Content-Type", "text/html; charset=utf-8");
            return res.send(
              notFoundHtml("Shop not found", "The requested shop does not exist."),
            );
          }
          res.set("Content-Type", "text/html; charset=utf-8");
          res.send(shopHtml(s));
        })
        .catch(() => next());
    }

    // /p/:id (on subdomain)
    if (parts.length === 2 && parts[0] === "p") {
      const productId = parts[1];
      return Promise.all([
        Seller.findOne({ where: { shop_name: shopNameFromSub } }),
        Product.findByPk(productId),
      ])
        .then(([s, p]) => {
          if (!s || !p || p.seller_id !== s.id) {
            res.status(404);
            res.set("Content-Type", "text/html; charset=utf-8");
            return res.send(
              notFoundHtml(
                "Product not found",
                "The requested product does not exist in this shop.",
              ),
            );
          }
          // Validate product belongs to this shop
          res.set("Content-Type", "text/html; charset=utf-8");
          res.send(productHtml(p, s));
        })
        .catch(() => next());
    }

    return next();
  }

  // --- Legacy path-based routes (old format, for bots that still use old URLs) ---

  // /:shopName
  if (parts.length === 1) {
    const name = parts[0];
    if (RESERVED.has(name.toLowerCase()) || name.includes(".")) return next();

    return Seller.findOne({ where: { shop_name: name } })
      .then(async (s) => {
        if (!s) return next();

        const products = await Product.findAll({
          where: { seller_id: s.id },
          attributes: ["id", "titleKu", "titleAr"],
          order: [["updatedAt", "DESC"]],
          limit: 80,
        });

        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(shopHtml(s, products));
      })
      .catch(() => next());
  }

  // /:shopName/profile
  if (parts.length === 2 && parts[1] === "profile") {
    const name = parts[0];
    if (RESERVED.has(name.toLowerCase())) return next();

    return Seller.findOne({ where: { shop_name: name } })
      .then((s) => {
        if (!s) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml("Shop not found", "The requested shop does not exist."),
          );
        }
        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(shopHtml(s));
      })
      .catch(() => next());
  }

  // /:shopName/p/:id
  if (parts.length === 3 && parts[1] === "p") {
    const name = parts[0];
    const productId = parts[2];
    if (RESERVED.has(name.toLowerCase())) return next();

    return Promise.all([
      Seller.findOne({ where: { shop_name: name } }),
      Product.findByPk(productId),
    ])
      .then(([s, p]) => {
        if (!s || !p || p.seller_id !== s.id) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Product not found",
              "The requested product does not exist in this shop.",
            ),
          );
        }
        // Validate product belongs to this shop
        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(productHtml(p, s));
      })
      .catch(() => next());
  }

  next();
}
