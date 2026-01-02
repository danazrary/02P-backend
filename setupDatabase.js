/**
 * Database Setup Script
 * Run this file once to create all tables in your MySQL database
 *
 * Usage: node backend/setupDatabase.js
 */

import {
  sequelize,
  Seller,
  Plan,
  SellerPlan,
  Product,
  SellerOffer,
} from "./database/index.js";

const setupDatabase = async () => {
  try {
    console.log("🔄 Starting database synchronization...");

    // Sync all models with the database
    // { alter: true } will modify existing tables if structure changed
    // { force: false } will not drop existing tables
    await sequelize.sync({ alter: true });

    console.log("✅ All tables created/updated successfully!");
    console.log("\n📊 Created Tables:");
    console.log("   - sellers");
    console.log("   - plans");
    console.log("   - seller_plans");
    console.log("   - products");
    console.log("   - seller_offers");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during database setup:", error);
    process.exit(1);
  }
};

setupDatabase();
