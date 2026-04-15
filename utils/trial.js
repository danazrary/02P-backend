import SellerPlan from "../database/sellerPlan.js";
import Plan from "../database/plan.js";

export async function giveTrialToSeller(sellerId) {
  const plan = await Plan.findOne({
    where: { name: "small_seller", billing_cycle: "monthly" },
  });

  const startsAt = new Date();
  const expiresAt = new Date();
  expiresAt.setDate(startsAt.getDate() + 7); // 🔥 7-day trial

  await SellerPlan.create({
    seller_id: sellerId,
    plan_id: plan.id,
    starts_at: startsAt,
    expires_at: expiresAt,
    is_trial: true,
    is_active: true,
  });
}
/*  */