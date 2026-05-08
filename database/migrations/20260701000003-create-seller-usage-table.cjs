"use strict";

/**
 * Migration: Create seller_usage table if it does not already exist.
 *
 * Mirrors the SellerUsage model (database/sellerUsage.js):
 *   - seller_id  → PRIMARY KEY (one row per seller)
 *   - storage_used_mb → DECIMAL(12,4), tracks total R2 usage
 *   - updatedAt  → auto-updated timestamp (createdAt is disabled in model)
 *
 * Safe: wrapped in existence check, never drops data.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_usage'`
    );

    if (rows[0].cnt > 0) {
      console.log("⏭️  seller_usage table already exists – skipping");
      return;
    }

    await queryInterface.createTable("seller_usage", {
      seller_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        comment: "FK to seller.id – one row per seller",
      },
      storage_used_mb: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        comment: "Total R2 storage consumed by this seller in megabytes",
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
        comment: "Auto-updated on every upsert",
      },
    });

    console.log("✅ Created seller_usage table");
  },

  async down(queryInterface) {
    // Only drop if the table is empty (safety guard)
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_usage'`
    );
    if (rows[0].cnt === 0) return;

    const [data] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS cnt FROM seller_usage"
    );
    if (data[0].cnt === 0) {
      await queryInterface.dropTable("seller_usage");
    }
  },
};
