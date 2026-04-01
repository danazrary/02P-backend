import { Router } from "express";
import { Op } from "sequelize";
import Product from "../../database/products.js";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import Report from "../../database/report.js";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { toUTC } from "../../utils/timezoneHandler.js";

const router = Router();

router.get("/data", jwtVerifySellerToken, async (req, res) => {
  try {
    const { id: sellerId } = req.user;

    /* -------------------- Seller -------------------- */
    const seller = await Seller.findByPk(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        logout: true,
        message: "Seller not found",
      });
    }

    /* -------------------- Seller Plan -------------------- */
    let sellerPlanRecord = await SellerPlan.findOne({
      where: { seller_id: sellerId },
    });

    if (!sellerPlanRecord) {
      sellerPlanRecord = await SellerPlan.create({
        seller_id: sellerId,
        plan_id: 1,
        start_date: toUTC(new Date()),
        end_date: toUTC(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        is_trial: false,
        status: true,
      });
    }

    const sellerPlan = await Plan.findByPk(sellerPlanRecord.plan_id);

    /* -------------------- Reports -------------------- */
    const reports = await Report.findAll({
      where: { seller_id: sellerId },
      order: [["report_date", "ASC"]],
    });

    /* -------------------- Analytics Calculation -------------------- */
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    const sumReports = (where) =>
      Report.findOne({
        where,
        attributes: [
          [
            Report.sequelize.fn("SUM", Report.sequelize.col("shopVisitors")),
            "shopVisitors",
          ],
          [
            Report.sequelize.fn("SUM", Report.sequelize.col("productViews")),
            "productViews",
          ],
          [
            Report.sequelize.fn("SUM", Report.sequelize.col("orders")),
            "orders",
          ],
        ],
        raw: true,
      });

    const analytics = {
      daily: await sumReports({
        seller_id: sellerId,
        report_date: { [Op.gte]: startOfDay },
      }),
      weekly: await sumReports({
        seller_id: sellerId,
        report_date: { [Op.gte]: startOfWeek },
      }),
      monthly: await sumReports({
        seller_id: sellerId,
        report_date: { [Op.gte]: startOfMonth },
      }),
      yearly: await sumReports({
        seller_id: sellerId,
        report_date: { [Op.gte]: startOfYear },
      }),
      lifetime: await sumReports({
        seller_id: sellerId,
      }),
    };

    /* -------------------- Top 10 Products -------------------- */
    const topProducts = await Product.findAll({
      where: { seller_id: sellerId },
      order: [["views", "DESC"]],
      limit: 10,
      attributes: ["id", "views", "titleAr", "titleKu", "images"],
    });

    const formattedTopProducts = topProducts.map((p) => ({
      id: p.id,
      views: p.views,
      titleAr: p.titleAr,
      titleKu: p.titleKu,
      image: Array.isArray(p.images) ? p.images[0] : null,
    }));

    /* -------------------- Response -------------------- */
    return res.status(200).json({
      success: true,
      error: false,
      logout: false,
      sellerPlan: sellerPlan ? sellerPlan.name : "Free",
      brand_color: seller.brand_color || null,
      analytics,
      topProducts: formattedTopProducts,
      reports, // full raw report table if you need it later
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: true,
      logout: false,
      message: "Server error",
    });
  }
});

export default router;
