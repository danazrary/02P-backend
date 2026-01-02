import sequelize from "./sequelize.js";

import Seller from "./seller.js";
import Plan from "./plan.js";
import SellerPlan from "./sellerPlan.js";
import Product from "./products.js";
import SellerOffer from "./sellerOffer.js";

/* ============================
   ASSOCIATIONS
============================ */

Seller.hasMany(SellerPlan, { foreignKey: "seller_id" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id" });

Seller.hasMany(Product, { foreignKey: "seller_id" });
Product.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasMany(SellerOffer, { foreignKey: "seller_id" });
SellerOffer.belongsTo(Seller, { foreignKey: "seller_id" });

/* ============================
   EXPORT
============================ */

export { sequelize, Seller, Plan, SellerPlan, Product, SellerOffer };

/* import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql",
  }
);

try {
  await sequelize.authenticate();
  console.log("✅ Connection established successfully.");
} catch (error) {
  console.error("❌ Unable to connect to the database:", error);
}

export default sequelize;
 */
