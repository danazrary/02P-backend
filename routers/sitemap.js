import { Router } from "express";
import { Op } from "sequelize";
import Seller from "../database/seller.js";
import Product from "../database/products.js";

const router = Router();
const BASE_DOMAIN = process.env.BASE_DOMAIN || "dwkanlink.com";
const CANONICAL_PROTOCOL = process.env.CANONICAL_PROTOCOL || "https";
const SHOP_URL_MODE =
  (process.env.SITEMAP_SHOP_URL_MODE || "subdomain").toLowerCase() === "path"
    ? "path"
    : "subdomain";
const ROOT_CANONICAL_URL = (
  process.env.FRONTEND_ORIGIN || `${CANONICAL_PROTOCOL}://${BASE_DOMAIN}`
).replace(/\/$/, "");

/** Format a Date or ISO string as YYYY-MM-DD for <lastmod>. */
function toLastmod(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "static",
  "assets",
  "uploads",
  "mail",
  "ftp",
  "smtp",
  "support",
  "help",
  "blog",
  "news",
]);

function getRequestHostname(req) {
  return (req.headers.host || "").split(":")[0].toLowerCase();
}

function getShopFromHost(hostname) {
  if (!hostname) return null;
  if (!hostname.endsWith(`.${BASE_DOMAIN}`)) return null;

  const suffix = `.${BASE_DOMAIN}`;
  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())) return null;

  return subdomain;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function emptySitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
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

function buildShopUrl(shopName) {
  if (SHOP_URL_MODE === "path") {
    return `${ROOT_CANONICAL_URL}/shop/${encodeURIComponent(shopName)}`;
  }
  return `${CANONICAL_PROTOCOL}://${shopName}.${BASE_DOMAIN}`;
}

function buildProductUrl(shopName, productId) {
  if (SHOP_URL_MODE === "path") {
    return `${ROOT_CANONICAL_URL}/shop/${encodeURIComponent(shopName)}/p/${encodeURIComponent(String(productId))}`;
  }
  return `${CANONICAL_PROTOCOL}://${shopName}.${BASE_DOMAIN}/p/${encodeURIComponent(String(productId))}`;
}

function buildCategoryUrl(shopName, categorySlug, subcategorySlug = null) {
  const baseUrl =
    SHOP_URL_MODE === "path"
      ? `${ROOT_CANONICAL_URL}/shop/${encodeURIComponent(shopName)}`
      : `${CANONICAL_PROTOCOL}://${shopName}.${BASE_DOMAIN}`;

  if (subcategorySlug) {
    return `${baseUrl}/c/${categorySlug}/${subcategorySlug}`;
  }

  return `${baseUrl}/c/${categorySlug}`;
}

function buildUrlNode({ loc, lastmod, changefreq, priority }) {
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}${changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : ""}${priority ? `\n    <priority>${priority}</priority>` : ""}\n  </url>`;
}

function generateSitemapXml(entries) {
  const body = entries.map((entry) => buildUrlNode(entry)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/**
 * Fetches all sitemap rows using minimal columns only.
 * Runtime-only: data comes from live DB on each request.
 */
async function fetchGlobalSitemapRows() {
  const [sellers, products] = await Promise.all([
    Seller.findAll({
      attributes: [
        "id",
        "shop_name",
        "updatedAt",
        "categories",
        "subcategories_map",
      ],
      where: {
        shop_name: {
          [Op.ne]: null,
        },
      },
      raw: true,
    }),
    Product.findAll({
      attributes: ["id", "seller_id", "updatedAt"],
      raw: true,
    }),
  ]);

  return { sellers, products };
}

async function fetchSubdomainSitemapRows(shopName) {
  const seller = await Seller.findOne({
    where: { shop_name: shopName },
    attributes: [
      "id",
      "shop_name",
      "updatedAt",
      "categories",
      "subcategories_map",
    ],
    raw: true,
  });

  if (!seller) return { seller: null, products: [] };

  const products = await Product.findAll({
    where: { seller_id: seller.id },
    attributes: ["id", "updatedAt"],
    raw: true,
  });

  return { seller, products };
}

/**
 * GET /sitemap.xml - Dynamically generate the sitemap
 * Sets proper XML content-type header
 */
router.get("/sitemap.xml", async (req, res) => {
  res.header("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=0, must-revalidate");

  try {
    const hostname = getRequestHostname(req);
    const shopName = getShopFromHost(hostname);

    // Subdomain-specific sitemap request: include only this shop and its products.
    if (shopName) {
      const { seller, products } = await fetchSubdomainSitemapRows(shopName);

      if (!seller) {
        return res.status(200).send(emptySitemapXml());
      }

      const entries = [
        {
          loc: buildShopUrl(seller.shop_name),
          lastmod: toLastmod(seller.updatedAt),
          changefreq: "weekly",
          priority: "0.9",
        },
        ...(Array.isArray(seller.categories) ? seller.categories : [])
          .map((categoryName) => {
            const categorySlug = slugifyCategorySegment(categoryName);
            if (!categorySlug) return null;

            return {
              loc: buildCategoryUrl(seller.shop_name, categorySlug),
              lastmod: toLastmod(seller.updatedAt),
              changefreq: "weekly",
              priority: "0.7",
            };
          })
          .filter(Boolean),
        ...Object.entries(seller.subcategories_map || {}).flatMap(
          ([categoryName, subcategories]) => {
            const categorySlug = slugifyCategorySegment(categoryName);
            if (!categorySlug || !Array.isArray(subcategories)) return [];

            return subcategories
              .map((subcategoryName) => {
                const subcategorySlug = slugifyCategorySegment(subcategoryName);
                if (!subcategorySlug) return null;

                return {
                  loc: buildCategoryUrl(
                    seller.shop_name,
                    categorySlug,
                    subcategorySlug,
                  ),
                  lastmod: toLastmod(seller.updatedAt),
                  changefreq: "weekly",
                  priority: "0.6",
                };
              })
              .filter(Boolean);
          },
        ),
        ...products
          .filter((p) => p.id)
          .map((p) => ({
            loc: buildProductUrl(seller.shop_name, p.id),
            lastmod: toLastmod(p.updatedAt),
            changefreq: "weekly",
            priority: "0.7",
          })),
      ];

      return res.status(200).send(generateSitemapXml(entries));
    }

    // Global sitemap request: include every shop and every product.
    const { sellers, products } = await fetchGlobalSitemapRows();
    const sellerMap = new Map(
      sellers.filter((s) => s.shop_name).map((s) => [s.id, s]),
    );

    const sellerEntries = sellers
      .filter((s) => s.shop_name)
      .map((s) => ({
        loc: buildShopUrl(s.shop_name),
        lastmod: toLastmod(s.updatedAt),
        changefreq: "weekly",
        priority: "0.8",
      }));

    const categoryEntries = sellers.flatMap((seller) => {
      if (!seller.shop_name) return [];

      const directCategoryEntries = (
        Array.isArray(seller.categories) ? seller.categories : []
      )
        .map((categoryName) => {
          const categorySlug = slugifyCategorySegment(categoryName);
          if (!categorySlug) return null;

          return {
            loc: buildCategoryUrl(seller.shop_name, categorySlug),
            lastmod: toLastmod(seller.updatedAt),
            changefreq: "weekly",
            priority: "0.7",
          };
        })
        .filter(Boolean);

      const subcategoryEntries = Object.entries(
        seller.subcategories_map || {},
      ).flatMap(([categoryName, subcategories]) => {
        const categorySlug = slugifyCategorySegment(categoryName);
        if (!categorySlug || !Array.isArray(subcategories)) return [];

        return subcategories
          .map((subcategoryName) => {
            const subcategorySlug = slugifyCategorySegment(subcategoryName);
            if (!subcategorySlug) return null;

            return {
              loc: buildCategoryUrl(
                seller.shop_name,
                categorySlug,
                subcategorySlug,
              ),
              lastmod: toLastmod(seller.updatedAt),
              changefreq: "weekly",
              priority: "0.6",
            };
          })
          .filter(Boolean);
      });

      return [...directCategoryEntries, ...subcategoryEntries];
    });

    const productEntries = products
      .map((p) => {
        const seller = sellerMap.get(p.seller_id);
        if (!seller || !p.id) return null;

        return {
          loc: buildProductUrl(seller.shop_name, p.id),
          lastmod: toLastmod(p.updatedAt),
          changefreq: "weekly",
          priority: "0.7",
        };
      })
      .filter(Boolean);

    return res
      .status(200)
      .send(
        generateSitemapXml([
          ...sellerEntries,
          ...categoryEntries,
          ...productEntries,
        ]),
      );
  } catch (error) {
    console.error("❌ Sitemap generation failed:", error);
    // Production safety: return a valid empty sitemap instead of failing.
    return res.status(200).send(emptySitemapXml());
  }
});

/**
 * Pings Google to notify them of the sitemap update
 * This should be called MANUALLY after adding a new seller or product to the database
 *
 * ⚠️ IMPORTANT: This function should NOT be called on every request!
 * Only call it when:
 * - A new seller is created
 * - A new product is added
 *
 * Calling locations (examples):
 * 1. After Seller.create() in OAuth callbacks
 * 2. After new seller signup
 * 3. After new product creation
 *
 * Example usage in seller auth endpoint:
 * ```javascript
 * import { pingGoogleSitemap } from "../sitemap.js";
 *
 * // After successfully creating a new seller:
 * if (!sellerExisted) {
 *   pingGoogleSitemap().catch(err =>
 *     console.warn("⚠️ Google ping warning:", err.message)
 *   );
 * }
 * ```
 *
 * @returns {Promise<void>}
 */
/**
 * Google deprecated the /ping?sitemap= endpoint (returns 404 since mid-2023).
 * Sitemap discovery now relies on Google Search Console and regular crawling.
 * This function is kept as a no-op so existing call sites don't break.
 */
export async function pingGoogleSitemap() {
  // No-op: Google ping endpoint is deprecated
}

export default router;
