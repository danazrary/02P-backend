import ProductStats from "../database/mySQL/product_stats.js";
import { Op } from "sequelize";
//.
//.
//incrementView
async function incrementView(productId) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  await ProductStats.upsert(
    {
      product_id: productId,
      stat_date: today,
      views: 1, // Sequelize will merge this value on insert
    },
    {
      fields: ["views"],
    }
  );

  await ProductStats.increment("views", {
    by: 1,
    where: { product_id: productId, stat_date: today },
  });
}
//.
//.
// incrementAddToCart
async function incrementAddToCart(productId) {
  const today = new Date().toISOString().split("T")[0];

  await ProductStats.upsert(
    {
      product_id: productId,
      stat_date: today,
      add_to_cart: 1,
    },
    {
      fields: ["add_to_cart"],
    }
  );

  await ProductStats.increment("add_to_cart", {
    by: 1,
    where: { product_id: productId, stat_date: today },
  });
}
