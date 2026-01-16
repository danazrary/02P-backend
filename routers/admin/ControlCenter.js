import { Router } from "express";
import { Op, Sequelize } from "sequelize";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import Product from "../../database/products.js";
import SellerOffer from "../../database/sellerOffer.js";

const router = Router();

/**
 * POST /admin/check-expired-plans
 * This route is meant to be called by a CRON job
 */
router.post("/check-expired-plans", async (req, res) => {
  try {
    const now = new Date();

    // find active plans that are expired
    const expiredPlans = await SellerPlan.findAll({
      where: {
        end_date: { [Op.lt]: now },
        status: true,
      },
      include: [
        {
          model: Seller,
          attributes: ["id", "name", "phone", "shop_name"],
        },
        {
          model: Plan,
          attributes: ["name"],
        },
      ],
    });

    for (const sellerPlan of expiredPlans) {
      const seller = sellerPlan.seller;

      if (!seller || !seller.phone) continue;

      // ⚠️ SEND WHATSAPP HERE
      // sendWhatsApp(seller.phone, message)

      console.log(
        `WhatsApp → ${seller.phone}: Plan "${sellerPlan.plan?.name}" expired`
      );

      // deactivate plan to avoid re-sending
      sellerPlan.status = false;
      await sellerPlan.save();
    }

    res.json({
      success: true,
      expiredCount: expiredPlans.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.post("/cleanup-expired-sellers", async (req, res) => {
  try {
    const now = new Date();

    // expired more than 10 days ago AND not renewed
    const expiredPlans = await SellerPlan.findAll({
      where: {
        status: false,
        end_date: {
          [Op.lt]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 10 DAY)"),
        },
      },
      attributes: ["seller_id"],
      group: ["seller_id"],
    });

    let removedProducts = 0;
    let removedOffers = 0;

    for (const plan of expiredPlans) {
      const sellerId = plan.seller_id;

      // delete products
      removedProducts += await Product.destroy({
        where: { seller_id: sellerId },
      });

      // delete offers
      removedOffers += await SellerOffer.destroy({
        where: { seller_id: sellerId },
      });
    }

    res.json({
      success: true,
      sellersAffected: expiredPlans.length,
      removedProducts,
      removedOffers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

router.post("/add-seller-plan", async (req, res) => {
  try {
    const { seller_id, plan_id, is_trial = false } = req.body;

    if (!seller_id || !plan_id) {
      return res.status(400).json({ message: "Missing data" });
    }

    const seller = await Seller.findByPk(seller_id);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const plan = await Plan.findByPk(plan_id);
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // deactivate all previous plans
    await SellerPlan.update({ status: false }, { where: { seller_id } });

    const startDate = new Date();
    const endDate = new Date(startDate);

    if (plan.duration_days > 0) {
      endDate.setDate(endDate.getDate() + plan.duration_days);
    }

    const newPlan = await SellerPlan.create({
      seller_id,
      plan_id,
      start_date: startDate,
      end_date: endDate,
      is_trial,
      status: true,
    });

    res.json({
      success: true,
      message: "Plan assigned successfully",
      plan: {
        name: plan.name,
        billing_cycle: plan.billing_cycle,
        price: plan.price,
        max_products: plan.max_products,
        start_date: startDate,
        end_date: endDate,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

router.post("/activate-trial", async (req, res) => {
  try {
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({ message: "seller_id is required" });
    }

    // find seller plan with plan_id = 1
    const sellerPlan = await SellerPlan.findOne({
      where: {
        seller_id,
        plan_id: 1,
        status: true,
      },
    });

    if (!sellerPlan) {
      return res
        .status(404)
        .json({ message: "Active free plan not found for this seller" });
    }

    // update trial flag only
    sellerPlan.is_trial = true;
    await sellerPlan.save();

    res.json({
      success: true,
      message: "Trial activated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});



export default router;
