import { Router } from "express";
import Seller from "../database/seller.js";
import Product from "../database/products.js";

const router = Router();

/**
 * Generates the XML sitemap dynamically
 * Queries the database for all sellers and products
 * Uses Sequelize include to get seller info for each product
 */
async function generateSitemap() {
  try {
    // Fetch all sellers and products from the database
    const [sellers, products] = await Promise.all([
      Seller.findAll({ attributes: ["id", "shop_name"], raw: true }),
      Product.findAll({
        attributes: ["id"],
        include: [
          {
            model: Seller,
            attributes: ["shop_name"],
            required: true, // Only include products with valid sellers
          },
        ],
        raw: true,
        nest: true, // Needed for proper nesting with include
      }),
    ]);

    // Build the sitemap XML
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    // Add seller URLs: https://dwkanlink.com/:shop_name
    sellers.forEach((seller) => {
      if (seller.shop_name) {
        xmlContent += `  <url>
    <loc>https://dwkanlink.com/${seller.shop_name}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;

        // Profile page
        xmlContent += `  <url>
    <loc>https://dwkanlink.com/${seller.shop_name}/profile</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
      }
    });

    // Add product URLs: https://dwkanlink.com/:shop_name/product-details/:product_id
    products.forEach((product) => {
      // Access seller info through the included Seller object
      if (product.Seller && product.Seller.shop_name && product.id) {
        xmlContent += `  <url>
    <loc>https://dwkanlink.com/${product.Seller.shop_name}/product-details/${product.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
      }
    });

    // Close the XML
    xmlContent += `</urlset>`;

    return xmlContent;
  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
    throw error;
  }
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
