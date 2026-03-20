import sequelize from "./sequelize.js";

import Seller from "./seller.js";
import Plan from "./plan.js";
import SellerPlan from "./sellerPlan.js";
import Product from "./products.js";
import SellerOffer from "./sellerOffer.js";
import Admin from "./admin.js";
import AdminDevice from "./adminDevice.js";
import Feedback from "./feedback.js";
import Offer from "./offer.js";
import Question from "./questions.js";
import Report from "./report.js";

/* ============================
   ASSOCIATIONS
============================ */
Seller.hasMany(SellerPlan, { foreignKey: "seller_id", as: "plans" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id", as: "sellerPlans" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id", as: "plan" });

/* Seller.hasMany(SellerPlan, { foreignKey: "seller_id" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id" });
 */
Seller.hasMany(Product, { foreignKey: "seller_id" });
Product.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasMany(SellerOffer, { foreignKey: "seller_id" });
SellerOffer.belongsTo(Seller, { foreignKey: "seller_id" });

Admin.hasMany(AdminDevice, { foreignKey: "admin_id" });
AdminDevice.belongsTo(Admin, { foreignKey: "admin_id" });

Seller.hasMany(Report, { foreignKey: "seller_id" });
Report.belongsTo(Seller, { foreignKey: "seller_id" });

/* ============================
   EXPORT
============================ */

export {
  sequelize,
  Seller,
  Plan,
  SellerPlan,
  Product,
  SellerOffer,
  Admin,
  AdminDevice,
  Feedback,
  Offer,
  Question,
  Report,
};

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
