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
      // FREE (with 15 products)
      {
        name: "free_with_15_products",
        billing_cycle: "free",
        price: 0,
        duration_days: 0,
        max_products: 15,
        storage_limit_mb: 100,
      },

      // FREE (legacy - no products)
      {
        name: "free_seller",
        billing_cycle: "free",
        price: 0,
        duration_days: 0,
        max_products: 0,
      },

      // SMALL (Basic) — 100 products, 500 MB storage
      {
        name: "small_seller",
        billing_cycle: "monthly",
        price: 5000,
        duration_days: 30,
        max_products: 100,
        storage_limit_mb: 500,
      },
      {
        name: "small_seller",
        billing_cycle: "yearly",
        price: 50000,
        duration_days: 365,
        max_products: 100,
        storage_limit_mb: 500,
      },

      // MEDIUM (Pro) — 400 products, 2 GB storage
      {
        name: "medium_seller",
        billing_cycle: "monthly",
        price: 10000,
        duration_days: 30,
        max_products: 400,
        storage_limit_mb: 2048,
      },
      {
        name: "medium_seller",
        billing_cycle: "yearly",
        price: 100000,
        duration_days: 365,
        max_products: 400,
        storage_limit_mb: 2048,
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
