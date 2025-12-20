import { Router } from "express";
//seller routers
import sellerAuthRouter from "./seller/auth.js";
import sellerSettingsRouter from "./seller/setting.js";
import sellerAddingProductRouter from "./seller/addProduct.js";
import sellerDashboardRouter from "./seller/dashboard.js";
//customer routers
import customerProductRouter from "./customer/product.js";
//admin routers
const router = Router();
//seller routers
router.use("/seller/auth", sellerAuthRouter);
router.use("/seller/setting", sellerSettingsRouter);
router.use("/seller", sellerAddingProductRouter);
router.use("/seller", sellerDashboardRouter);
//customer routers
router.use("/customer", customerProductRouter);
//admin routers
export default router;
