import Seller from "../database/seller.js";
import Product from "../database/products.js";
import ProductImage from "../database/productImages.js";
import { RESERVED_SHOP_NAMES } from "../utils/reservedShopNames.js";
import {
  getCategoryLabel,
  getCategoryMap,
  getSubcategoryLabel,
} from "../utils/categoryTranslations.js";

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

function slugifyCategorySegment(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findCategoryBySlug(categoryMap = {}, slug) {
  if (!slug) return null;
  return (
    Object.keys(categoryMap).find(
      (key) => slugifyCategorySegment(key) === slug,
    ) || null
  );
}

function getMainProductImage(product) {
  const mainRecord = Array.isArray(product?.productImages)
    ? product.productImages.find((image) => image?.is_main) ||
      product.productImages[0]
    : null;

  if (mainRecord?.image_key) {
    return imgUrl(mainRecord.image_key, "products");
  }

  const legacyImages = Array.isArray(product?.images) ? product.images : [];
  if (legacyImages[0]) {
    return imgUrl(legacyImages[0], "products");
  }

  return `${process.env.FRONTEND_ORIGIN || "https://dwkanlink.com"}/og-default.png`;
}

function truncateText(str, max = 180) {
  if (!str) return "";
  const value = String(str).trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function categoryHtml({
  seller,
  categoryKey,
  categoryName,
  subcategoryKey = null,
  subcategoryName = null,
  products = [],
}) {
  const baseDomain = process.env.BASE_DOMAIN || "dwkanlink.com";
  const shopUrl = `https://${seller.shop_name}.${baseDomain}`;
  const categorySlug = slugifyCategorySegment(categoryKey);
  const subcategorySlug = subcategoryKey
    ? slugifyCategorySegment(subcategoryKey)
    : null;
  const categoryUrl = subcategorySlug
    ? `${shopUrl}/c/${categorySlug}/${subcategorySlug}`
    : `${shopUrl}/c/${categorySlug}`;
  const sellerImage = imgUrl(seller.shop_image, "sellers");
  const categoryLabel = subcategoryName
    ? `${subcategoryName} - ${categoryName}`
    : categoryName;
  const title = esc(`${categoryLabel} - ${seller.shop_name} - ${SITE_NAME}`);
  const description = esc(
    truncateText(
      subcategoryName
        ? `Browse ${subcategoryName} products in ${categoryName} from ${seller.shop_name}.`
        : `Browse ${categoryName} products from ${seller.shop_name}.`,
      160,
    ),
  );

  const productCards = Array.isArray(products)
    ? products
        .filter((p) => p && p.id)
        .slice(0, 80)
        .map((p) => {
          const productTitle = esc(p.titleKu || p.titleAr || `Product ${p.id}`);
          const productDescription = esc(
            truncateText(
              p.descriptionKu ||
                p.descriptionAr ||
                `${productTitle} - ${seller.shop_name}`,
              180,
            ),
          );
          const productLink = `${shopUrl}/p/${p.id}`;
          const productImage = getMainProductImage(p);

          return `<article>
  <a href="${esc(productLink)}">
    <img src="${esc(productImage)}" alt="${productTitle}" loading="lazy">
    <h2>${productTitle}</h2>
    <p>${productDescription}</p>
  </a>
</article>`;
        })
        .join("\n")
    : "";

  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: categoryLabel,
    url: categoryUrl,
    isPartOf: shopUrl,
    about: categoryName,
  });

  return `<!DOCTYPE html>
<html lang="ku" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
<link rel="canonical" href="${esc(categoryUrl)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${esc(sellerImage)}">
<meta property="og:url" content="${esc(categoryUrl)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${esc(sellerImage)}">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<header>
  <h1>${esc(categoryLabel)}</h1>
  <p>${description}</p>
</header>
${productCards ? `<section>${productCards}</section>` : `<section><p>No products found in this category.</p></section>`}
</body>
</html>`;
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
  const image = getMainProductImage(product) || `${frontend}/og-default.png`;
  const currency = product.priceType === "IQD" ? "IQD" : "USD";
  const price =
    product.hasDiscount && product.discount_percent
      ? product.realPrice * (1 - product.discount_percent / 100)
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
              notFoundHtml(
                "Shop not found",
                "The requested shop does not exist.",
              ),
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
        Product.findByPk(productId, {
          include: [
            {
              model: ProductImage,
              as: "productImages",
              attributes: ["image_key", "is_main"],
              required: false,
            },
          ],
        }),
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

    // /c/:category and /c/:category/:subcategory (on subdomain)
    if (parts[0] === "c" && (parts.length === 2 || parts.length === 3)) {
      const categorySlug = parts[1];
      const subcategorySlug = parts[2] || null;

      return Seller.findOne({
        where: { shop_name: shopNameFromSub },
        attributes: [
          "id",
          "shop_name",
          "shop_image",
          "default_shop_lang",
          "category_translations",
        ],
      })
        .then(async (seller) => {
          if (!seller) {
            res.status(404);
            res.set("Content-Type", "text/html; charset=utf-8");
            return res.send(
              notFoundHtml(
                "Shop not found",
                "The requested shop does not exist.",
              ),
            );
          }

          const categoryMap = getCategoryMap(seller);
          const categoryKey = findCategoryBySlug(categoryMap, categorySlug);
          if (!categoryKey) {
            res.status(404);
            res.set("Content-Type", "text/html; charset=utf-8");
            return res.send(
              notFoundHtml(
                "Category not found",
                "The requested category does not exist.",
              ),
            );
          }

          const category = categoryMap[categoryKey];
          const categoryName = getCategoryLabel(
            category,
            categoryKey,
            seller.default_shop_lang,
          );
          let subcategoryKey = null;
          let subcategoryName = null;
          if (subcategorySlug) {
            subcategoryKey = findCategoryBySlug(
              category.subcategories,
              subcategorySlug,
            );
            if (!subcategoryKey) {
              res.status(404);
              res.set("Content-Type", "text/html; charset=utf-8");
              return res.send(
                notFoundHtml(
                  "Subcategory not found",
                  "The requested subcategory does not exist.",
                ),
              );
            }
            subcategoryName = getSubcategoryLabel(
              category.subcategories[subcategoryKey],
              subcategoryKey,
              seller.default_shop_lang,
            );
          }

          const products = await Product.findAll({
            where: {
              seller_id: seller.id,
              category: categoryKey,
              ...(subcategoryKey ? { subcategory: subcategoryKey } : {}),
            },
            attributes: [
              "id",
              "titleKu",
              "titleAr",
              "descriptionKu",
              "descriptionAr",
              "images",
            ],
            include: [
              {
                model: ProductImage,
                as: "productImages",
                attributes: ["image_key", "is_main"],
                required: false,
              },
            ],
            order: [["updatedAt", "DESC"]],
            limit: 80,
          });

          res.status(200);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            categoryHtml({
              seller,
              categoryKey,
              categoryName,
              subcategoryKey,
              subcategoryName,
              products,
            }),
          );
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
            notFoundHtml(
              "Shop not found",
              "The requested shop does not exist.",
            ),
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
      Product.findByPk(productId, {
        include: [
          {
            model: ProductImage,
            as: "productImages",
            attributes: ["image_key", "is_main"],
            required: false,
          },
        ],
      }),
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

  // /:shopName/c/:category and /:shopName/c/:category/:subcategory
  if (parts.length === 3 && parts[1] === "c") {
    const name = parts[0];
    const categorySlug = parts[2];
    if (RESERVED.has(name.toLowerCase())) return next();

    return Seller.findOne({
      where: { shop_name: name },
      attributes: [
        "id",
        "shop_name",
        "shop_image",
        "default_shop_lang",
        "category_translations",
      ],
    })
      .then(async (seller) => {
        if (!seller) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Shop not found",
              "The requested shop does not exist.",
            ),
          );
        }

        const categoryMap = getCategoryMap(seller);
        const categoryKey = findCategoryBySlug(categoryMap, categorySlug);
        if (!categoryKey) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Category not found",
              "The requested category does not exist.",
            ),
          );
        }

        const products = await Product.findAll({
          where: { seller_id: seller.id, category: categoryKey },
          attributes: [
            "id",
            "titleKu",
            "titleAr",
            "descriptionKu",
            "descriptionAr",
            "images",
          ],
          include: [
            {
              model: ProductImage,
              as: "productImages",
              attributes: ["image_key", "is_main"],
              required: false,
            },
          ],
          order: [["updatedAt", "DESC"]],
          limit: 80,
        });

        res.status(200);
        res.set("Content-Type", "text/html; charset=utf-8");
        const categoryName = getCategoryLabel(
          categoryMap[categoryKey],
          categoryKey,
          seller.default_shop_lang,
        );
        return res.send(
          categoryHtml({ seller, categoryKey, categoryName, products }),
        );
      })
      .catch(() => next());
  }

  if (parts.length === 4 && parts[1] === "c") {
    const name = parts[0];
    const categorySlug = parts[2];
    const subcategorySlug = parts[3];
    if (RESERVED.has(name.toLowerCase())) return next();

    return Seller.findOne({
      where: { shop_name: name },
      attributes: [
        "id",
        "shop_name",
        "shop_image",
        "default_shop_lang",
        "category_translations",
      ],
    })
      .then(async (seller) => {
        if (!seller) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Shop not found",
              "The requested shop does not exist.",
            ),
          );
        }

        const categoryMap = getCategoryMap(seller);
        const categoryKey = findCategoryBySlug(categoryMap, categorySlug);
        if (!categoryKey) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Category not found",
              "The requested category does not exist.",
            ),
          );
        }

        const category = categoryMap[categoryKey];
        const subcategoryKey = findCategoryBySlug(
          category.subcategories,
          subcategorySlug,
        );
        if (!subcategoryKey) {
          res.status(404);
          res.set("Content-Type", "text/html; charset=utf-8");
          return res.send(
            notFoundHtml(
              "Subcategory not found",
              "The requested subcategory does not exist.",
            ),
          );
        }

        const products = await Product.findAll({
          where: {
            seller_id: seller.id,
            category: categoryKey,
            subcategory: subcategoryKey,
          },
          attributes: [
            "id",
            "titleKu",
            "titleAr",
            "descriptionKu",
            "descriptionAr",
            "images",
          ],
          include: [
            {
              model: ProductImage,
              as: "productImages",
              attributes: ["image_key", "is_main"],
              required: false,
            },
          ],
          order: [["updatedAt", "DESC"]],
          limit: 80,
        });

        res.status(200);
        res.set("Content-Type", "text/html; charset=utf-8");
        const categoryName = getCategoryLabel(
          category,
          categoryKey,
          seller.default_shop_lang,
        );
        const subcategoryName = getSubcategoryLabel(
          category.subcategories[subcategoryKey],
          subcategoryKey,
          seller.default_shop_lang,
        );
        return res.send(
          categoryHtml({
            seller,
            categoryKey,
            categoryName,
            subcategoryKey,
            subcategoryName,
            products,
          }),
        );
      })
      .catch(() => next());
  }

  next();
}
