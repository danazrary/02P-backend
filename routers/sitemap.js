import { Router } from "express";
import Seller from "../database/seller.js";
import Product from "../database/products.js";

const router = Router();
const BASE_DOMAIN = process.env.BASE_DOMAIN || "dwkanlink.com";

function encodeShopName(name) {
  return encodeURIComponent(name).replace(/%20/g, "+");
}

/**
 * Generates the XML sitemap dynamically.
 * All URLs use subdomain format: https://shopName.dwkanlink.com
 *
 * Structure is kept flat for now but can be split into:
 *   /sitemap-index.xml → /sitemap-sellers.xml + /sitemap-products.xml
 */
async function generateSitemap() {
  const [sellers, products] = await Promise.all([
    Seller.findAll({ attributes: ["id", "shop_name"], raw: true }),
    Product.findAll({
      attributes: ["id"],
      include: [
        {
          model: Seller,
          attributes: ["shop_name"],
          required: true,
        },
      ],
    }),
  ]);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  // Seller URLs
  for (const seller of sellers) {
    if (!seller.shop_name) continue;
    const encoded = encodeShopName(seller.shop_name);

    xml += `  <url>
    <loc>https://${encoded}.${BASE_DOMAIN}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://${encoded}.${BASE_DOMAIN}/profile</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
  }

  // Product URLs
  for (const product of products) {
    const shopName = product.Seller?.shop_name;
    if (!shopName || !product.id) continue;

    xml += `  <url>
    <loc>https://${encodeShopName(shopName)}.${BASE_DOMAIN}/p/${product.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  }

  xml += `</urlset>`;
  return xml;
}

/**
 * GET /sitemap.xml - Dynamically generate the sitemap
 * Sets proper XML content-type header
 */
router.get("/sitemap.xml", async (req, res) => {
  try {
    const sitemap = await generateSitemap();

    // Set proper XML header
    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (error) {
    console.error("❌ Sitemap generation failed:", error);
    res.status(500).json({ message: "Failed to generate sitemap" });
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
