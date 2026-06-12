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
import SellerUsage from "./sellerUsage.js";
import ProductImage from "./productImages.js";
import SellerCategory from "./sellerCategory.js";
import Order from "./order.js";
import OrderItem from "./orderItem.js";
import SellerPushSubscription from "./sellerPushSubscription.js";
import HelpItem from "./helpItem.js";
import HelpTranslation from "./helpTranslation.js";
import HelpFeedback from "./helpFeedback.js";
import HelpAnalytics from "./helpAnalytics.js";

/* ============================
   ASSOCIATIONS
============================ */
Seller.hasMany(SellerPlan, { foreignKey: "seller_id", as: "plans" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id", as: "sellerPlans" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id", as: "plan" });

Seller.hasMany(Product, { foreignKey: "seller_id" });
Product.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasMany(SellerOffer, { foreignKey: "seller_id" });
SellerOffer.belongsTo(Seller, { foreignKey: "seller_id" });

// SellerUsage: one row per seller
Seller.hasOne(SellerUsage, { foreignKey: "seller_id", as: "usage" });
SellerUsage.belongsTo(Seller, { foreignKey: "seller_id" });

// ProductImages: one product has many image records
Product.hasMany(ProductImage, {
  foreignKey: "product_id",
  as: "productImages",
});
ProductImage.belongsTo(Product, { foreignKey: "product_id" });

// SellerCategory: one seller has many categories (and subcategories)
Seller.hasMany(SellerCategory, {
  foreignKey: "seller_id",
  as: "sellerCategories",
});
SellerCategory.belongsTo(Seller, { foreignKey: "seller_id" });

// SellerCategory self-reference: parent → children (subcategories)
SellerCategory.hasMany(SellerCategory, {
  foreignKey: "parent_id",
  as: "subcategories",
});
SellerCategory.belongsTo(SellerCategory, {
  foreignKey: "parent_id",
  as: "parentCategory",
});

// Orders: one seller has many orders
Seller.hasMany(Order, { foreignKey: "seller_id", as: "orders" });
Order.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

// OrderItems: one order has many items
Order.hasMany(OrderItem, { foreignKey: "order_id", as: "items" });
OrderItem.belongsTo(Order, { foreignKey: "order_id", as: "order" });

// Seller push subscriptions: one seller can have multiple browsers/devices.
Seller.hasMany(SellerPushSubscription, {
  foreignKey: "seller_id",
  as: "pushSubscriptions",
});
SellerPushSubscription.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});

// Help Center: recursive help tree with optional translations per language.
HelpItem.hasMany(HelpItem, {
  foreignKey: "parent_id",
  as: "children",
});
HelpItem.belongsTo(HelpItem, {
  foreignKey: "parent_id",
  as: "parent",
});
HelpItem.hasMany(HelpTranslation, {
  foreignKey: "help_item_id",
  as: "translations",
});
HelpTranslation.belongsTo(HelpItem, {
  foreignKey: "help_item_id",
  as: "item",
});
HelpItem.hasMany(HelpFeedback, {
  foreignKey: "help_item_id",
  as: "feedback",
});
HelpFeedback.belongsTo(HelpItem, {
  foreignKey: "help_item_id",
  as: "item",
});
HelpItem.hasMany(HelpAnalytics, {
  foreignKey: "help_item_id",
  as: "analytics",
});
HelpAnalytics.belongsTo(HelpItem, {
  foreignKey: "help_item_id",
  as: "item",
});
Seller.hasMany(HelpFeedback, {
  foreignKey: "seller_id",
  as: "helpFeedback",
});
HelpFeedback.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});
Seller.hasMany(HelpAnalytics, {
  foreignKey: "seller_id",
  as: "helpAnalytics",
});
HelpAnalytics.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});

/* Seller.hasMany(SellerPlan, { foreignKey: "seller_id" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id" });
 */

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
  SellerUsage,
  ProductImage,
  SellerCategory,
  Order,
  OrderItem,
  SellerPushSubscription,
  HelpItem,
  HelpTranslation,
  HelpFeedback,
  HelpAnalytics,
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
