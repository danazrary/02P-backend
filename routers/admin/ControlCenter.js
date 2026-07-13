import { Router } from "express";
import { Op, Sequelize } from "sequelize";
import Seller from "../../database/seller.js";
import SellerPlan from "../../database/sellerPlan.js";
import Plan from "../../database/plan.js";
import Product from "../../database/products.js";
import SellerOffer from "../../database/sellerOffer.js";
import Question from "../../database/questions.js";
import SellerUsage from "../../database/sellerUsage.js";
import SellerAiUsage from "../../database/sellerAiUsage.js";
import { checkMe, adminAuth } from "../../middlewares/jwtVerify.js";
import { toUTC } from "../../utils/timezoneHandler.js";
import { clearCookieOpts } from "../../utils/addingToken.js";
const router = Router();

router.get("/check-me", checkMe, async (req, res) => {
  const { user } = req;
  if (user.role === "customer") {
    return res.json({ role: "customer" });
  } else if (user.role === "seller") {
    const findSeller = await Seller.findByPk(user.data.id, {
      attributes: ["shop_name", "id"],
    });

    return res.json({ role: "seller", seller: findSeller });
  } else if (user.role === "admin") {
    return res.json({ role: "admin" });
  }
});
router.get("/check-expired-plans", adminAuth, async (req, res) => {
  try {
    const now = new Date();

    const expiredPlans = await SellerPlan.findAll({
      where: {
        end_date: { [Op.lt]: now },
      },
      include: [
        {
          model: Seller,
          as: "seller", // ✅ REQUIRED alias
          attributes: ["id", "name", "shop_name", "phone"],
        },
        {
          model: Plan,
          as: "plan", // ✅ REQUIRED alias
          attributes: ["name"],
        },
      ],
      order: [["end_date", "ASC"]],
    });

    // format data for frontend
    const result = expiredPlans.map((sp) => ({
      sellerId: sp.seller?.id ?? null,
      sellerName: sp.seller?.name ?? null,
      shopName: sp.seller?.shop_name ?? null,
      phone: sp.seller?.phone ?? null,
      planName: sp.plan?.name ?? null,
      startDate: sp.start_date,
      endDate: sp.end_date,
    }));

    return res.json({
      success: true,
      error: false,
      expiredCount: result.length,
      data: result,
    });
  } catch (err) {
    console.error("check-expired-plans error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

router.post("/cleanup-expired-sellers", adminAuth, async (req, res) => {
  try {
    const now = new Date();

    // expired more than 10 days ago AND not renewed
    const expiredPlans = await SellerPlan.findAll({
      where: {
        status: false,
        end_date: {
          [Op.lt]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 15 DAY)"),
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

router.post("/add-seller-plan", adminAuth, async (req, res) => {
  try {
    const { seller_id, plan_id, is_trial = false } = req.body;

    if (!seller_id || !plan_id) {
      return res
        .status(400)
        .json({ success: false, error: true, message: "Missing data" });
    }

    const seller = await Seller.findByPk(seller_id);

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    const plan = await Plan.findByPk(plan_id);

    if (!plan) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Plan not found" });
    }

    const startDate = toUTC(new Date());
    let endDate = toUTC(new Date(startDate));

    if (plan.duration_days > 0) {
      const parsedEndDate = new Date(endDate);
      parsedEndDate.setDate(parsedEndDate.getDate() + plan.duration_days);
      endDate = toUTC(parsedEndDate);
    }

    // 🔍 check if seller already has a plan record
    const existingPlan = await SellerPlan.findOne({
      where: { seller_id },
    });

    let sellerPlan;

    if (existingPlan) {
      // 🔁 UPDATE existing plan (store as UTC)
      sellerPlan = await existingPlan.update({
        plan_id,
        start_date: startDate,
        end_date: endDate,
        is_trial,
        status: true,
      });
    } else {
      // ➕ CREATE new plan (store as UTC)
      sellerPlan = await SellerPlan.create({
        seller_id,
        plan_id,
        start_date: startDate,
        end_date: endDate,
        is_trial,
        status: true,
      });
    }

    res.json({
      success: true,
      error: false,
      message: existingPlan
        ? "Plan updated successfully"
        : "Plan assigned successfully",
      plan: {
        name: plan.name,
        billing_cycle: plan.billing_cycle,
        price: plan.price,
        max_products: plan.max_products,
        start_date: sellerPlan.start_date,
        end_date: sellerPlan.end_date,
      },
    });
  } catch (error) {
    console.error("add-seller-plan error:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/activate-trial", adminAuth, async (req, res) => {
  try {
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "seller_id is required",
      });
    }

    // 1️⃣ Check if seller exists
    const seller = await Seller.findByPk(seller_id);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    // 2️⃣ Find any existing plan for this seller
    let sellerPlan = await SellerPlan.findOne({
      where: { seller_id },
      order: [["end_date", "DESC"]], // get the latest plan if multiple
    });

    // 3️⃣ If seller has no plan, create a free trial
    if (!sellerPlan) {
      const startDate = toUTC(new Date());
      const endDate = toUTC(
        new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000),
      );

      sellerPlan = await SellerPlan.create({
        seller_id,
        plan_id: 1, // free/trial plan
        start_date: startDate,
        end_date: endDate,
        is_trial: true,
        status: true,
      });
    } else {
      // 4️⃣ If existing plan is plan_id = 1, activate trial
      if (sellerPlan.plan_id === 1) {
        sellerPlan.is_trial = true;
        await sellerPlan.save();
      } else {
        // If plan is > 1, don’t allow trial
        return res.status(400).json({
          success: false,
          error: true,
          message: "Seller already has a paid plan, trial not allowed",
        });
      }
    }

    res.json({
      success: true,
      error: false,
      message: "Trial activated successfully",
      plan: {
        start_date: sellerPlan.start_date,
        end_date: sellerPlan.end_date,
        is_trial: sellerPlan.is_trial,
        plan_id: sellerPlan.plan_id,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

// Get all sellers with trial plans
router.post("/get-trial-sellers", adminAuth, async (req, res) => {
  try {
    const trialSellers = await SellerPlan.findAll({
      where: {
        is_trial: true,
        status: true,
      },
      include: [
        {
          model: Seller,
          as: "seller",
          attributes: ["id", "name", "shop_name"],
        },
      ],
      order: [["end_date", "ASC"]],
    });

    const result = trialSellers.map((sp) => ({
      sellerId: sp.seller?.id ?? null,
      sellerName: sp.seller?.name ?? null,
      shopName: sp.seller?.shop_name ?? null,
      startDate: sp.start_date,
      endDate: sp.end_date,
    }));

    return res.json({
      success: true,
      error: false,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("get-trial-sellers error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// End trial for a specific seller
router.post("/end-trial", adminAuth, async (req, res) => {
  try {
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "seller_id is required",
      });
    }

    const sellerPlan = await SellerPlan.findOne({
      where: { seller_id, is_trial: true, status: true },
    });

    if (!sellerPlan) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "No active trial found for this seller",
      });
    }

    // Set end_date to now (UTC) and mark trial as ended
    await sellerPlan.update({
      end_date: toUTC(new Date()),
      is_trial: false,
      trial_ended: true,
      status: false,
    });

    return res.json({
      success: true,
      error: false,
      message: "Trial ended successfully",
    });
  } catch (err) {
    console.error("end-trial error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Check for sellers exceeding plan limits and remove excess
router.post("/check-limit-violations", adminAuth, async (req, res) => {
  try {
    const sellerPlans = await SellerPlan.findAll({
      where: { status: true },
      include: [
        {
          model: Seller,
          as: "seller",
          attributes: ["id", "name", "shop_name"],
        },
        {
          model: Plan,
          as: "plan",
          attributes: ["name", "max_products", "max_offers"],
        },
      ],
    });

    const violations = [];
    let totalProductsRemoved = 0;
    let totalOffersRemoved = 0;

    for (const sp of sellerPlans) {
      const sellerId = sp.seller_id;
      const maxProducts = sp.plan?.max_products ?? 0;
      const maxOffers = sp.plan?.max_offers ?? 0;

      // Count current products and offers
      const productCount = await Product.count({
        where: { seller_id: sellerId },
      });
      const offerCount = await SellerOffer.count({
        where: { seller_id: sellerId, is_active: true },
      });

      let productsRemoved = 0;
      let offersRemoved = 0;

      // Remove excess products
      if (productCount > maxProducts) {
        const excessCount = productCount - maxProducts;
        const excessProducts = await Product.findAll({
          where: { seller_id: sellerId },
          order: [["createdAt", "DESC"]],
          limit: excessCount,
        });

        for (const product of excessProducts) {
          await product.destroy();
          productsRemoved++;
        }
      }

      // Remove excess offers
      if (offerCount > maxOffers) {
        const excessCount = offerCount - maxOffers;
        const excessOffers = await SellerOffer.findAll({
          where: { seller_id: sellerId, is_active: true },
          order: [["createdAt", "DESC"]],
          limit: excessCount,
        });

        for (const offer of excessOffers) {
          await offer.destroy();
          offersRemoved++;
        }
      }

      if (productsRemoved > 0 || offersRemoved > 0) {
        violations.push({
          sellerId: sp.seller?.id,
          sellerName: sp.seller?.name,
          shopName: sp.seller?.shop_name,
          planName: sp.plan?.name,
          productsRemoved,
          offersRemoved,
        });
        totalProductsRemoved += productsRemoved;
        totalOffersRemoved += offersRemoved;
      }
    }

    return res.json({
      success: true,
      error: false,
      violationsCount: violations.length,
      totalProductsRemoved,
      totalOffersRemoved,
      data: violations,
    });
  } catch (err) {
    console.error("check-limit-violations error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Get all sellers with their plan information
router.post("/get-all-sellers", adminAuth, async (req, res) => {
  try {
    const sellers = await Seller.findAll({
      attributes: ["id", "name", "shop_name"],
      include: [
        {
          model: SellerPlan,
          as: "plans",
          required: false,
          include: [
            {
              model: Plan,
              as: "plan",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["id", "ASC"]],
    });

    const result = sellers.map((seller) => {
      const sellerPlan = seller.plans?.[0] || seller.plans;
      return {
        sellerId: seller.id,
        sellerName: seller.name,
        shopName: seller.shop_name,
        planName: sellerPlan?.plan?.name ?? "No Plan",
        startDate: sellerPlan?.start_date ?? null,
        endDate: sellerPlan?.end_date ?? null,
      };
    });

    return res.json({
      success: true,
      error: false,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("get-all-sellers error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Get all available plans
router.post("/get-plans", adminAuth, async (req, res) => {
  try {
    const plans = await Plan.findAll({
      attributes: [
        "id",
        "name",
        "price",
        "billing_cycle",
        "duration_days",
        "max_products",
        "max_offers",
      ],
      order: [["id", "ASC"]],
    });

    return res.json({
      success: true,
      error: false,
      count: plans.length,
      data: plans,
    });
  } catch (err) {
    console.error("get-plans error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Add a new question
router.post("/add-question", adminAuth, async (req, res) => {
  try {
    const {
      titleKu,
      titleAr,
      descriptionKu,
      descriptionAr,
      youtubeUrlKu,
      youtubeUrlAr,
    } = req.body;

    const question = await Question.create({
      titleKu: titleKu || null,
      titleAr: titleAr || null,
      descriptionKu: descriptionKu || null,
      descriptionAr: descriptionAr || null,
      youtubeUrlKu: youtubeUrlKu || null,
      youtubeUrlAr: youtubeUrlAr || null,
    });

    return res.json({
      success: true,
      error: false,
      message: "Question added successfully",
      data: question,
    });
  } catch (err) {
    console.error("add-question error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Get all questions
router.post("/get-questions", adminAuth, async (req, res) => {
  try {
    const questions = await Question.findAll({
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      success: true,
      error: false,
      count: questions.length,
      data: questions,
    });
  } catch (err) {
    console.error("get-questions error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Delete a question
router.post("/delete-question", adminAuth, async (req, res) => {
  try {
    const { question_id } = req.body;

    if (!question_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "question_id is required",
      });
    }

    const question = await Question.findByPk(question_id);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Question not found",
      });
    }

    await question.destroy();

    return res.json({
      success: true,
      error: false,
      message: "Question deleted successfully",
    });
  } catch (err) {
    console.error("delete-question error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Admin logout
router.post("/logout", adminAuth, (req, res) => {
  res.clearCookie("admin_token", clearCookieOpts());
  return res.json({ success: true, message: "Logged out successfully" });
});

// Get sellers who requested account deletion
router.post("/get-deletion-requested-sellers", adminAuth, async (req, res) => {
  try {
    const sellers = await Seller.findAll({
      where: { deletion_requested_at: { [Op.ne]: null } },
      attributes: ["id", "name", "shop_name", "phone", "deletion_requested_at"],
      order: [["deletion_requested_at", "ASC"]],
    });

    const now = new Date();
    const result = sellers.map((s) => {
      const reqAt = new Date(s.deletion_requested_at);
      const daysSince = Math.floor((now - reqAt) / (1000 * 60 * 60 * 24));
      return {
        sellerId: s.id,
        sellerName: s.name,
        shopName: s.shop_name,
        phone: s.phone,
        deletionRequestedAt: s.deletion_requested_at,
        daysSince,
      };
    });

    return res.json({
      success: true,
      error: false,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("get-deletion-requested-sellers error:", err);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

// Delete a seller account permanently
router.post("/delete-seller-account", adminAuth, async (req, res) => {
  try {
    const { seller_id } = req.body;

    if (!seller_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "seller_id is required",
      });
    }

    const seller = await Seller.findByPk(seller_id);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, error: true, message: "Seller not found" });
    }

    await Product.destroy({ where: { seller_id } });
    await SellerOffer.destroy({ where: { seller_id } });
    await SellerPlan.destroy({ where: { seller_id } });
    await SellerUsage.destroy({ where: { seller_id } });
    await seller.destroy();

    return res.json({
      success: true,
      error: false,
      message: "Seller account deleted successfully",
    });
  } catch (err) {
    console.error("delete-seller-account error:", err);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

// Get sellers with product count and storage usage (paginated, 20 per req)
router.post("/get-sellers-usage", adminAuth, async (req, res) => {
  try {
    const LIMIT = 20;
    const offset = parseInt(req.body.offset || 0, 10);

    const { count: total, rows: sellers } = await Seller.findAndCountAll({
      attributes: ["id", "name", "shop_name"],
      include: [
        {
          model: SellerUsage,
          as: "usage",
          required: false,
          attributes: ["storage_used_mb"],
        },
      ],
      order: [["id", "ASC"]],
      limit: LIMIT,
      offset,
    });

    const sellerIds = sellers.map((s) => s.id);

    let countMap = {};
    if (sellerIds.length > 0) {
      const productCounts = await Product.findAll({
        where: { seller_id: { [Op.in]: sellerIds } },
        attributes: [
          "seller_id",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        ],
        group: ["seller_id"],
        raw: true,
      });
      for (const pc of productCounts) {
        countMap[pc.seller_id] = parseInt(pc.count, 10);
      }
    }

    const result = sellers.map((s) => ({
      sellerId: s.id,
      sellerName: s.name,
      shopName: s.shop_name,
      productCount: countMap[s.id] || 0,
      storageMb: parseFloat(s.usage?.storage_used_mb || 0).toFixed(2),
    }));

    return res.json({
      success: true,
      error: false,
      total,
      hasMore: offset + LIMIT < total,
      data: result,
    });
  } catch (err) {
    console.error("get-sellers-usage error:", err);
    return res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

/* ========================================
   SUBSCRIPTION EXTENSION MANAGEMENT ROUTES
======================================== */

// Search sellers by shop_name, seller_name, email, or seller_id
router.post(
  "/extend-subscription/search-sellers",
  adminAuth,
  async (req, res) => {
    try {
      const { query } = req.body;

      if (!query || query.trim() === "") {
        return res.json({
          success: true,
          data: [],
          count: 0,
        });
      }

      const searchTerm = `%${query}%`;

      const sellers = await Seller.findAll({
        where: {
          [Op.or]: [
            { shop_name: { [Op.like]: searchTerm } },
            { name: { [Op.like]: searchTerm } },
            { email: { [Op.like]: searchTerm } },
            { id: isNaN(query) ? undefined : parseInt(query, 10) },
          ],
        },
        attributes: ["id", "name", "shop_name", "email"],
        limit: 15,
        raw: true,
      });

      return res.json({
        success: true,
        data: sellers,
        count: sellers.length,
      });
    } catch (err) {
      console.error("search-sellers error:", err);
      return res.status(500).json({
        success: false,
        error: true,
        message: "Server error",
      });
    }
  },
);

// Get seller's subscription details
router.post(
  "/extend-subscription/get-seller-subscription",
  adminAuth,
  async (req, res) => {
    try {
      const { seller_id } = req.body;

      if (!seller_id) {
        return res.status(400).json({
          success: false,
          error: true,
          message: "Seller ID is required",
        });
      }

      const seller = await Seller.findByPk(seller_id, {
        attributes: ["id", "name", "shop_name", "email"],
      });

      if (!seller) {
        return res.status(404).json({
          success: false,
          error: true,
          message: "Seller not found",
        });
      }

      // Get latest subscription
      const sellerPlan = await SellerPlan.findOne({
        where: { seller_id },
        include: [
          {
            model: Plan,
            as: "plan",
            attributes: ["name"],
          },
        ],
        order: [["end_date", "DESC"]],
      });

      if (!sellerPlan) {
        return res.json({
          success: true,
          seller: seller.toJSON(),
          subscription: null,
          hasSubscription: false,
        });
      }

      const now = new Date();
      const isActive = sellerPlan.end_date > now;
      const remainingDays = isActive
        ? Math.ceil((sellerPlan.end_date - now) / (1000 * 60 * 60 * 24))
        : 0;

      return res.json({
        success: true,
        seller: seller.toJSON(),
        subscription: {
          planName: sellerPlan.plan?.name || "Unknown",
          startDate: sellerPlan.start_date,
          endDate: sellerPlan.end_date,
          isActive,
          remainingDays: remainingDays < 0 ? 0 : remainingDays,
        },
        hasSubscription: true,
      });
    } catch (err) {
      console.error("get-seller-subscription error:", err);
      return res.status(500).json({
        success: false,
        error: true,
        message: "Server error",
      });
    }
  },
);

// Extend seller subscription - Just update end_date
router.post("/extend-subscription/extend-plan", adminAuth, async (req, res) => {
  try {
    const { seller_id, days_to_add } = req.body;

    // Validation
    if (!seller_id || !days_to_add) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Seller ID and days to add are required",
      });
    }

    // Validate days_to_add is a positive number
    const daysNumber = parseInt(days_to_add, 10);
    if (isNaN(daysNumber) || daysNumber <= 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Days to add must be a positive number",
      });
    }

    const seller = await Seller.findByPk(seller_id, {
      attributes: ["id", "name", "shop_name"],
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: true,
        message: "Seller not found",
      });
    }

    // Get current subscription
    const sellerPlan = await SellerPlan.findOne({
      where: { seller_id },
      order: [["end_date", "DESC"]],
    });

    if (!sellerPlan) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Seller has no active subscription",
      });
    }

    const now = new Date();
    const currentEndDate = new Date(sellerPlan.end_date);
    const isActive = currentEndDate > now;

    let newEndDate;

    if (isActive) {
      // If active, add days to current expiration
      newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + parseInt(days_to_add, 10));
    } else {
      // If expired, add days to today
      newEndDate = new Date(now);
      newEndDate.setDate(newEndDate.getDate() + parseInt(days_to_add, 10));
    }

    newEndDate = toUTC(newEndDate);

    // Update the plan - simple update, no logging table
    await sellerPlan.update({
      end_date: newEndDate,
      status: true,
    });

    return res.json({
      success: true,
      error: false,
      message: "Subscription extended successfully",
      data: {
        sellerName: seller.name,
        previousExpirationDate: currentEndDate,
        daysAdded: parseInt(days_to_add, 10),
        newExpirationDate: newEndDate,
      },
    });
  } catch (err) {
    console.error("extend-plan error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

// Get AI usage statistics for all sellers or a specific seller
router.post("/get-ai-usage", adminAuth, async (req, res) => {
  try {
    const { seller_id = null, timeframe = "all" } = req.body;
    // timeframe: "daily", "monthly", "all"

    let whereClause = { success: true };

    // Calculate date range based on timeframe
    let startDate = null;
    const now = new Date();

    if (timeframe === "daily") {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (startDate) {
      whereClause.createdAt = { [Op.gte]: startDate };
    }

    if (seller_id) {
      whereClause.seller_id = seller_id;
    }

    // Get AI usage records
    const aiUsageRecords = await SellerAiUsage.findAll({
      where: whereClause,
      include: [
        {
          model: Seller,
          as: "seller",
          attributes: ["id", "name", "shop_name"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Group by seller and calculate statistics
    const sellerStatsMap = {};

    aiUsageRecords.forEach((record) => {
      const sellerId = record.seller_id;
      if (!sellerStatsMap[sellerId]) {
        sellerStatsMap[sellerId] = {
          sellerId,
          sellerName: record.seller?.name,
          shopName: record.seller?.shop_name,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          estimatedTotalCost: 0,
          actions: {},
        };
      }

      const stats = sellerStatsMap[sellerId];
      stats.totalRequests += 1;

      if (record.success) {
        stats.successfulRequests += 1;
      } else {
        stats.failedRequests += 1;
      }

      if (record.input_tokens) {
        stats.totalInputTokens += record.input_tokens;
      }
      if (record.output_tokens) {
        stats.totalOutputTokens += record.output_tokens;
      }
      if (record.total_tokens) {
        stats.totalTokens += record.total_tokens;
      }

      if (record.estimated_input_cost_usd || record.estimated_output_cost_usd) {
        const inputCost = parseFloat(record.estimated_input_cost_usd) || 0;
        const outputCost = parseFloat(record.estimated_output_cost_usd) || 0;
        stats.estimatedTotalCost += inputCost + outputCost;
      }

      // Track by action
      const action = record.action || "unknown";
      if (!stats.actions[action]) {
        stats.actions[action] = 0;
      }
      stats.actions[action] += 1;
    });

    const sellerStats = Object.values(sellerStatsMap);

    res.json({
      success: true,
      timeframe,
      totalSellers: sellerStats.length,
      data: sellerStats,
    });
  } catch (error) {
    console.error("get-ai-usage error:", error);
    res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
