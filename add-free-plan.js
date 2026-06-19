/**
 * Migration Script to Add Free Plan
 * Adds a new Free Plan with ID 30 and 15 products
 *
 * Usage: node backend/add-free-plan.js
 */

import { sequelize, Plan } from "./database/index.js";

async function addFreePlan() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Check if free plan already exists
    const existingFreePlan = await Plan.findOne({
      where: { name: "free_with_15_products" },
    });

    if (existingFreePlan) {
      console.log("⚠️ Free plan already exists with ID:", existingFreePlan.id);
      process.exit(0);
    }

    // Create the free plan
    const freePlan = await Plan.create({
      name: "free_with_15_products",
      billing_cycle: "free",
      price: 0,
      duration_days: 0,
      max_products: 15,
      max_offers: 0,
      storage_limit_mb: 100,
    });

    console.log("✅ Free plan created successfully!");
    console.log(`   Plan ID: ${freePlan.id}`);
    console.log(`   Plan Name: ${freePlan.name}`);
    console.log(`   Max Products: ${freePlan.max_products}`);
    console.log(`   Storage Limit: ${freePlan.storage_limit_mb} MB`);
    console.log(`   Price: ${freePlan.price} IQD`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding free plan:", error.message);
    process.exit(1);
  }
}

addFreePlan();
