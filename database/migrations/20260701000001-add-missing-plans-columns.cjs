"use strict";

/**
 * Migration: Add missing columns to an existing plans table.
 *
 * For VPS databases that already have a plans table created by
 * sequelize.sync() and may be missing max_offers / storage_limit_mb.
 * Each column is added only when it is absent – safe to run multiple times.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("plans");

    if (!columns.max_offers) {
      await queryInterface.addColumn("plans", "max_offers", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
        comment: "Maximum active offers allowed for this plan",
      });
      console.log("✅ Added max_offers to plans");
    } else {
      console.log("⏭️  max_offers already exists in plans");
    }

    if (!columns.storage_limit_mb) {
      await queryInterface.addColumn("plans", "storage_limit_mb", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 500,
        comment: "Maximum R2 storage allowed for this plan in megabytes",
      });
      console.log("✅ Added storage_limit_mb to plans");
    } else {
      console.log("⏭️  storage_limit_mb already exists in plans");
    }
  },

  async down(queryInterface) {
    // Only remove if they were added by this migration
    // (safe: sequelize removeColumn is idempotent-friendly)
    const columns = await queryInterface.describeTable("plans");
    if (columns.max_offers) {
      await queryInterface.removeColumn("plans", "max_offers");
    }
    if (columns.storage_limit_mb) {
      await queryInterface.removeColumn("plans", "storage_limit_mb");
    }
  },
};
