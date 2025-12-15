import { sequelize, Plan } from "../database/index.js";

async function seedPlans() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const count = await Plan.count();
    if (count > 0) {
      console.log("⚠️ Plans already exist");
      process.exit(0);
    }

    await Plan.bulkCreate([
      // FREE
      {
        name: "free_seller",
        billing_cycle: "free",
        price: 0,
        duration_days: 0,
        max_products: 0,
      },

      // SMALL
      {
        name: "small_seller",
        billing_cycle: "monthly",
        price: 5000,
        duration_days: 30,
        max_products: 30,
      },
      {
        name: "small_seller",
        billing_cycle: "yearly",
        price: 50000,
        duration_days: 365,
        max_products: 30,
      },

      // MEDIUM
      {
        name: "medium_seller",
        billing_cycle: "monthly",
        price: 10000,
        duration_days: 30,
        max_products: 80,
      },
      {
        name: "medium_seller",
        billing_cycle: "yearly",
        price: 100000,
        duration_days: 365,
        max_products: 80,
      },

      // LARGE
      {
        name: "large_seller",
        billing_cycle: "monthly",
        price: 20000,
        duration_days: 30,
        max_products: 200,
      },
      {
        name: "large_seller",
        billing_cycle: "yearly",
        price: 200000,
        duration_days: 365,
        max_products: 200,
      },
    ]);

    console.log("✅ Plans seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding plans:", err);
    process.exit(1);
  }
}

seedPlans();
