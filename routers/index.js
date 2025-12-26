import { Router } from "express";
//seller routers
import sellerAuthRouter from "./seller/auth.js";
import sellerSettingsRouter from "./seller/setting.js";
import sellerAddingProductRouter from "./seller/addProduct.js";
import sellerDashboardRouter from "./seller/dashboard.js";
import sellerDataRouter from "./seller/data.js";
//customer routers
import customerShopRouter from "./customer/shop.js";
import customerProductRouter from "./customer/product.js";

//admin routers
const router = Router();
//seller routers
router.use("/seller/auth", sellerAuthRouter);
router.use("/seller/setting", sellerSettingsRouter);
router.use("/seller", sellerAddingProductRouter);
router.use("/seller", sellerDashboardRouter);
router.use("/seller", sellerDataRouter);
//customer routers
router.use("/customer", customerProductRouter);
router.use("/customer", customerShopRouter);
//admin routers
export default router;
