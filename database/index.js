import sequelize from "./sequelize.js";

// --- مۆدێلە کۆنەکان (V1) بۆ پاراستنی کۆدەکانی پێشوو ---
import Seller from "./seller.js";
import Product from "./products.js";

// --- مۆدێلە نوێیەکان (V2) بۆ سیستەم و تایبەتمەندییە نوێیەکان ---
import SellerV2 from "./sellerv2.js";
import ProductV2 from "./productv2.js";

// --- سەرجەم مۆدێلەکانی تر ---
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
   ١. پەیوەندییەکانی وەشانی کۆن (V1 Associations)
============================================== */
Seller.hasMany(SellerPlan, { foreignKey: "seller_id", as: "plans" });
SellerPlan.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Plan.hasMany(SellerPlan, { foreignKey: "plan_id", as: "sellerPlans" });
SellerPlan.belongsTo(Plan, { foreignKey: "plan_id", as: "plan" });

Seller.hasMany(Product, { foreignKey: "seller_id" });
Product.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasMany(SellerOffer, { foreignKey: "seller_id" });
SellerOffer.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasOne(SellerUsage, { foreignKey: "seller_id", as: "usage" });
SellerUsage.belongsTo(Seller, { foreignKey: "seller_id" });

Product.hasMany(ProductImage, {
  foreignKey: "product_id",
  as: "productImages",
});
ProductImage.belongsTo(Product, { foreignKey: "product_id" });

Seller.hasMany(SellerCategory, {
  foreignKey: "seller_id",
  as: "sellerCategories",
});
SellerCategory.belongsTo(Seller, { foreignKey: "seller_id" });

Seller.hasMany(Order, { foreignKey: "seller_id", as: "orders" });
Order.belongsTo(Seller, { foreignKey: "seller_id", as: "seller" });

Order.hasMany(OrderItem, { foreignKey: "order_id", as: "items" });
OrderItem.belongsTo(Order, { foreignKey: "order_id", as: "order" });

Seller.hasMany(SellerPushSubscription, {
  foreignKey: "seller_id",
  as: "pushSubscriptions",
});
SellerPushSubscription.belongsTo(Seller, {
  foreignKey: "seller_id",
  as: "seller",
});

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
   ٢. پەیوەندییەکانی وەشانی نوێ (V2 Associations)
============================================== */
SellerV2.hasMany(ProductV2, { foreignKey: "seller_id", as: "products" });
ProductV2.belongsTo(SellerV2, { foreignKey: "seller_id", as: "seller" });

SellerV2.hasMany(SellerPlan, { foreignKey: "seller_id", as: "plans_v2" });
SellerV2.hasOne(SellerUsage, { foreignKey: "seller_id", as: "usage_v2" });
SellerV2.hasMany(Order, { foreignKey: "seller_id", as: "orders_v2" });
SellerV2.hasMany(SellerPushSubscription, {
  foreignKey: "seller_id",
  as: "pushSubscriptions_v2",
});
SellerV2.hasOne(SellerAiBalance, {
  foreignKey: "seller_id",
  as: "aiBalance_v2",
});
SellerV2.hasMany(AiCreditPurchaseRequest, {
  foreignKey: "seller_id",
  as: "aiCreditPurchaseRequests_v2",
});
SellerV2.hasMany(SellerAiUsage, { foreignKey: "seller_id", as: "aiUsage_v2" });

/* ==============================================
   ٣. بەشە گشتییەکان (AI, Help Center, Admin)
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
  // وەشانی پێشوو
  Seller,
  Product,
  // وەشانی نوێ
  SellerV2,
  ProductV2,
  // مۆدێلە هاوبەشەکان
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
