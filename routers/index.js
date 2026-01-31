import { Router } from "express";
//admin routers
import adminControlCenterRouter from "./admin/ControlCenter.js";
import adminAuthRouter from "./admin/auth.js";
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
//customer routers
import customerShopRouter from "./customer/shop.js";
import customerProductRouter from "./customer/product.js";

const router = Router();
//admin routers
router.use("/admin/control-center", adminControlCenterRouter);
router.use("/admin/auth", adminAuthRouter);
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
//customer routers
router.use("/customer", customerProductRouter);
router.use("/customer", customerShopRouter);

export default router;
