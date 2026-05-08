"use strict";

/**
 * Migration: Create plans table if it does not already exist.
 * Safe for VPS that may already have a plans table created by
 * sequelize.sync() – uses CREATE TABLE IF NOT EXISTS pattern.
 *
 * Columns mirror the current Plan model in database/plan.js
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.sequelize
      .query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'plans'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      )
      .then((rows) => rows[0].cnt > 0);

    if (!tableExists) {
      await queryInterface.createTable("plans", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        name: {
          type: Sequelize.STRING(50),
          allowNull: false,
        },
        billing_cycle: {
          type: Sequelize.STRING(20),
          allowNull: false,
          comment: "monthly | yearly | free",
        },
        price: {
          type: Sequelize.FLOAT,
          allowNull: false,
        },
        duration_days: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        max_products: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        max_offers: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 5,
        },
        storage_limit_mb: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 500,
          comment: "Maximum R2 storage allowed for this plan in megabytes",
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal(
            "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
          ),
        },
      });
      console.log("✅ Created plans table");
    } else {
      console.log("⏭️  plans table already exists – skipping creation");
    }
  },

  async down(queryInterface) {
    // Only drop if empty to protect data
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS cnt FROM plans"
    );
    if (rows[0].cnt === 0) {
      await queryInterface.dropTable("plans");
    }
  },
};
