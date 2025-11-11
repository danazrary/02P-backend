import { Router } from "express";
import sellerAuthRouter from "./seller/auth.js";


const router = Router();

router.use("/seller/auth", sellerAuthRouter);
export default router;
