import { Router } from "express";
//admin routers
import adminControlCenterRouter from "./admin/ControlCenter.js";
import adminAuthRouter from "./admin/auth.js";
import adminHelpRouter from "./admin/help.js";
import adminAiProductImportRouter from "../routes/adminAiProductImportRoutes.js";
//seller routers
import sellerAuthRouter from "./seller/auth.js";
import sellerSettingsRouter from "./seller/setting.js";
import sellerAddingProductRouter from "./seller/addProduct.js";
import sellerDashboardRouter from "./seller/dashboard.js";
import sellerDataRouter from "./seller/data.js";
import sellerOfferRouter from "./seller/addOffer.js";
import sellerRedLineRouter from "./seller/redLine.js";
import sellerCustomerRouter from "./seller/sellersCustomer.js";
import sellerProfileRouter from "./seller/profile.js";
import sellerProductDiscountRouter from "./seller/productDiscount.js";
import sellerDeleteAccountRouter from "./seller/deleteAccount.js";
import sellerCategoryRouter from "./seller/category.js";
import sellerCatalogRouter from "./seller/catalog.js";
import sellerCategoryProductsRouter from "./seller/categoryProducts.js";
import sellerOrdersRouter from "./seller/orders.js";
import sellerShopSectionsRouter from "./seller/shopSections.js";
import sellerPushNotificationsRouter from "./seller/pushNotifications.js";
import sellerAiProductRouter from "../routes/sellerAiProductRoutes.js";
//customer routers
import customerShopRouter from "./customer/shop.js";
import customerProductRouter from "./customer/product.js";
import customerQuestionsRouter from "./customer/questions.js";
import customerSearchRouter from "./customer/search.js";
import customerOrdersRouter from "./customer/orders.js";
import helpRouter from "./help.js";

const router = Router();
//admin routers
router.use("/admin/control-center", adminControlCenterRouter);
router.use("/admin/auth", adminAuthRouter);
router.use("/admin/help", adminHelpRouter);
router.use("/admin", adminAiProductImportRouter);
//seller routers
router.use("/seller/auth", sellerAuthRouter);
router.use("/seller/setting", sellerSettingsRouter);
router.use("/seller", sellerAddingProductRouter);
router.use("/seller", sellerDashboardRouter);
router.use("/seller", sellerDataRouter);
router.use("/seller", sellerOfferRouter);
router.use("/seller", sellerRedLineRouter);
router.use("/seller", sellerCustomerRouter);
router.use("/seller", sellerProfileRouter);
router.use("/seller", sellerProductDiscountRouter);
router.use("/seller", sellerDeleteAccountRouter);
router.use("/seller", sellerCategoryRouter);
router.use("/seller", sellerCatalogRouter);
router.use("/seller", sellerCategoryProductsRouter);
router.use("/seller", sellerOrdersRouter);
router.use("/seller", sellerShopSectionsRouter);
router.use("/seller", sellerPushNotificationsRouter);
router.use("/seller", sellerAiProductRouter);
//customer routers
router.use("/customer", customerProductRouter);
router.use("/customer", customerQuestionsRouter);
router.use("/customer", customerSearchRouter);
router.use("/customer", customerOrdersRouter);
router.use("/customer", customerShopRouter);
router.use("/help", helpRouter);

export default router;
