import { Router } from "express";
import sellerAuthRouter from "./seller/auth.js";
import sellerSettingsRouter from "./seller/setting.js";
import sellerAddingProductRouter from "./seller/addProduct.js";
const router = Router();

router.use("/seller/auth", sellerAuthRouter);
router.use("/seller/setting", sellerSettingsRouter);
router.use("/seller", sellerAddingProductRouter);
export default router;
