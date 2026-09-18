import sequelize from "./sequelize.js";

// --- مۆدێلی نوێی فرۆشیار (V2) ---
import Seller from "./sellerv2.js";
import Product from "./products.js";

// --- مۆدێلەکانی تر ---
import Plan from "./plan.js";
import SellerPlan from "./sellerPlan.js";
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
import SellerAiUsage from "./sellerAiUsage.js";
import SellerAiBalance from "./sellerAiBalance.js";
import AiCreditPlan from "./aiCreditPlan.js";
import AiCreditPurchaseRequest from "./aiCreditPurchaseRequest.js";
import AiFeatureSetting from "./aiFeatureSetting.js";

/* ==============================================
   پەیوەندییەکانی Seller
============================================== */
// بەرهەمەکان (Products)
Seller.hasMany(Product, { foreignKey: "seller_id", as: "products" });
Product.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Product.hasMany(ProductImage, {
  foreignKey: "product_id",
  as: "productImages",
});
ProductImage.belongsTo(Product, { foreignKey: "product_id" });

// پلانەکان (Plans)
Seller.hasMany(SellerPlan, { foreignKey: "seller_id", as: "plans" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id", as: "sellerPlans" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id", as: "plan" });

// ئۆفەرەکان (Offers)
Seller.hasMany(SellerOffer, { foreignKey: "seller_id", as: "offers" });
SellerOffer.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

// کاتیگۆرییەکان (Categories)
Seller.hasMany(SellerCategory, {
  foreignKey: "seller_id",
  as: "sellerCategories",
});
SellerCategory.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

// بەکارهێنانی ستۆریج (Storage Usage)
Seller.hasOne(SellerUsage, { foreignKey: "seller_id", as: "usage" });
SellerUsage.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

// داواکارییەکان (Orders)
Seller.hasMany(Order, { foreignKey: "seller_id", as: "orders" });
Order.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Order.hasMany(OrderItem, { foreignKey: "order_id", as: "items" });
OrderItem.belongsTo(Order, { foreignKey: "order_id", as: "order" });

// ئاگادارکردنەوە (Push Subscriptions)
Seller.hasMany(SellerPushSubscription, {
  foreignKey: "seller_id",
  as: "pushSubscriptions",
});
SellerPushSubscription.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});

// خزمەتگوزاری و باڵانسی AI
Seller.hasOne(SellerAiBalance, { foreignKey: "seller_id", as: "aiBalance" });
SellerAiBalance.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Seller.hasMany(AiCreditPurchaseRequest, {
  foreignKey: "seller_id",
  as: "aiCreditPurchaseRequests",
});
AiCreditPurchaseRequest.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});

Seller.hasMany(SellerAiUsage, { foreignKey: "seller_id", as: "aiUsage" });
SellerAiUsage.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

/* ==============================================
   بەشە گشتییەکان (AI, Help Center, Admin)
============================================== */
AiCreditPlan.hasMany(AiCreditPurchaseRequest, {
  foreignKey: "plan_id",
  as: "purchaseRequests",
});
AiCreditPurchaseRequest.belongsTo(AiCreditPlan, {
  foreignKey: "plan_id",
  as: "plan",
});

SellerCategory.hasMany(SellerCategory, {
  foreignKey: "parent_id",
  as: "subcategories",
});
SellerCategory.belongsTo(SellerCategory, {
  foreignKey: "parent_id",
  as: "parentCategory",
});

HelpItem.hasMany(HelpItem, { foreignKey: "parent_id", as: "children" });
HelpItem.belongsTo(HelpItem, { foreignKey: "parent_id", as: "parent" });

HelpItem.hasMany(HelpTranslation, {
  foreignKey: "help_item_id",
  as: "translations",
});
HelpTranslation.belongsTo(HelpItem, { foreignKey: "help_item_id", as: "item" });

HelpItem.hasMany(HelpFeedback, { foreignKey: "help_item_id", as: "feedback" });
HelpFeedback.belongsTo(HelpItem, { foreignKey: "help_item_id", as: "item" });

HelpItem.hasMany(HelpAnalytics, {
  foreignKey: "help_item_id",
  as: "analytics",
});
HelpAnalytics.belongsTo(HelpItem, { foreignKey: "help_item_id", as: "item" });

export {
  sequelize,
  Seller,
  Product,
  Plan,
  SellerPlan,
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
  SellerAiUsage,
  SellerAiBalance,
  AiCreditPlan,
  AiCreditPurchaseRequest,
  AiFeatureSetting,
};
