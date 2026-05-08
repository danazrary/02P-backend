"use strict";

/**
 * Migration: Seed new plan tiers (Starter, Plus, Business, Business Pro).
 *
 * Each plan is only inserted when no row with the same name + billing_cycle
 * already exists. This protects existing plan rows (free_seller, small_seller,
 * medium_seller, large_seller) and prevents duplicate inserts on re-run.
 *
 * billing_cycle strings: "monthly" | "yearly"  (matches existing model)
 * storage_limit_mb: stored in MB (600 MB, 1200 MB, 10240 MB = 10 GB, 25600 MB = 25 GB)
 *
 * ⚠️  BACKUP COMMAND before running migrations on VPS:
 *    mysqldump -u root -p 02p > backup_before_migration.sql
 */

const NEW_PLANS = [
  // ── Starter ────────────────────────────────────────────────
  {
    name: "Starter",
    billing_cycle: "monthly",
    price: 5000,
    duration_days: 30,
    max_products: 45,
    max_offers: 5,
    storage_limit_mb: 600,
  },
  {
    name: "Starter",
    billing_cycle: "yearly",
    price: 50000, // ~2 months free vs monthly × 12
    duration_days: 365,
    max_products: 45,
    max_offers: 5,
    storage_limit_mb: 600,
  },

  // ── Plus ───────────────────────────────────────────────────
  {
    name: "Plus",
    billing_cycle: "monthly",
    price: 10000,
    duration_days: 30,
    max_products: 100,
    max_offers: 15,
    storage_limit_mb: 1200,
  },
  {
    name: "Plus",
    billing_cycle: "yearly",
    price: 100000,
    duration_days: 365,
    max_products: 100,
    max_offers: 15,
    storage_limit_mb: 1200,
  },

  // ── Business ───────────────────────────────────────────────
  {
    name: "Business",
    billing_cycle: "monthly",
    price: 25000,
    duration_days: 30,
    max_products: 10000, // hidden limit
    max_offers: 50,
    storage_limit_mb: 10240, // 10 GB
  },
  {
    name: "Business",
    billing_cycle: "yearly",
    price: 250000,
    duration_days: 365,
    max_products: 10000,
    max_offers: 50,
    storage_limit_mb: 10240,
  },

  // ── Business Pro ───────────────────────────────────────────
  {
    name: "Business Pro",
    billing_cycle: "monthly",
    price: 50000,
    duration_days: 30,
    max_products: 20000, // hidden limit
    max_offers: 150,
    storage_limit_mb: 25600, // 25 GB
  },
  {
    name: "Business Pro",
    billing_cycle: "yearly",
    price: 500000,
    duration_days: 365,
    max_products: 20000,
    max_offers: 150,
    storage_limit_mb: 25600,
  },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const plan of NEW_PLANS) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM plans WHERE name = ? AND billing_cycle = ? LIMIT 1`,
        {
          replacements: [plan.name, plan.billing_cycle],
          type: queryInterface.sequelize.QueryTypes.SELECT,
        }
      );

      if (!existing) {
        await queryInterface.sequelize.query(
          `INSERT INTO plans
             (name, billing_cycle, price, duration_days, max_products, max_offers, storage_limit_mb, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          {
            replacements: [
              plan.name,
              plan.billing_cycle,
              plan.price,
              plan.duration_days,
              plan.max_products,
              plan.max_offers,
              plan.storage_limit_mb,
              now,
              now,
            ],
          }
        );
        console.log(`✅ Inserted plan: ${plan.name} (${plan.billing_cycle})`);
      } else {
        console.log(
          `⏭️  Plan already exists: ${plan.name} (${plan.billing_cycle})`
        );
      }
    }
  },

  async down(queryInterface) {
    // Remove only the new plan names; legacy plans are untouched
    const names = [...new Set(NEW_PLANS.map((p) => p.name))];
    for (const name of names) {
      await queryInterface.sequelize.query(
        `DELETE FROM plans WHERE name = ?`,
        { replacements: [name] }
      );
    }
  },
};
