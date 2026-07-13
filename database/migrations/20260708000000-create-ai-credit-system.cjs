"use strict";

const plans = [
  { name: "Starter", credits: 20, price_iqd: 2000, sort_order: 1 },
  { name: "Basic", credits: 50, price_iqd: 4000, sort_order: 2 },
  { name: "Plus", credits: 150, price_iqd: 8000, sort_order: 3 },
  { name: "Business", credits: 500, price_iqd: 20000, sort_order: 4 },
];

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "seller_ai_balances"))) {
      await queryInterface.createTable("seller_ai_balances", {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        seller_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        credit_balance: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 3 },
        total_free_credits: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 3 },
        total_purchased: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        total_used: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("seller_ai_balances", ["seller_id"], {
        unique: true,
        name: "seller_ai_balances_seller_id_unique",
      });
    }

    if (!(await tableExists(queryInterface, "ai_credit_plans"))) {
      await queryInterface.createTable("ai_credit_plans", {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        credits: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        price_iqd: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("ai_credit_plans", ["is_active", "sort_order"], {
        name: "ai_credit_plans_active_sort",
      });
    }

    for (const plan of plans) {
      await queryInterface.sequelize.query(
        `INSERT INTO ai_credit_plans (name, credits, price_iqd, is_active, sort_order, createdAt, updatedAt)
         VALUES (:name, :credits, :price_iqd, true, :sort_order, NOW(), NOW())
         ON DUPLICATE KEY UPDATE credits = VALUES(credits), price_iqd = VALUES(price_iqd), is_active = true, sort_order = VALUES(sort_order), updatedAt = NOW()`,
        { replacements: plan },
      );
    }

    if (!(await tableExists(queryInterface, "ai_credit_purchase_requests"))) {
      await queryInterface.createTable("ai_credit_purchase_requests", {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        request_code: { type: Sequelize.STRING(32), allowNull: false, unique: true },
        seller_id: { type: Sequelize.INTEGER, allowNull: false },
        plan_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        plan_name_snapshot: { type: Sequelize.STRING(80), allowNull: false },
        credits_snapshot: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        price_iqd_snapshot: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        status: {
          type: Sequelize.ENUM("pending", "approved", "rejected", "cancelled"),
          allowNull: false,
          defaultValue: "pending",
        },
        agreement_accepted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requested_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        approved_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
        rejected_at: { type: Sequelize.DATE, allowNull: true },
        rejected_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("ai_credit_purchase_requests", ["request_code"], {
        unique: true,
        name: "ai_credit_purchase_requests_code_unique",
      });
      await queryInterface.addIndex("ai_credit_purchase_requests", ["seller_id", "plan_id", "status", "createdAt"], {
        name: "ai_credit_purchase_requests_duplicate_guard",
      });
    }

    if (!(await tableExists(queryInterface, "ai_feature_settings"))) {
      await queryInterface.createTable("ai_feature_settings", {
        id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        feature_key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        disabled_reason: { type: Sequelize.STRING(500), allowNull: true },
        disabled_source: { type: Sequelize.STRING(80), allowNull: true },
        disabled_at: { type: Sequelize.DATE, allowNull: true },
        enabled_at: { type: Sequelize.DATE, allowNull: true },
        consecutive_system_failures: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        consecutive_gemini_failures: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        last_failure_at: { type: Sequelize.DATE, allowNull: true },
        last_success_at: { type: Sequelize.DATE, allowNull: true },
        circuit_open_until: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex("ai_feature_settings", ["feature_key"], {
        unique: true,
        name: "ai_feature_settings_feature_key_unique",
      });
    }

    await queryInterface.sequelize.query(
      `INSERT INTO ai_feature_settings (feature_key, is_enabled, createdAt, updatedAt)
       VALUES ('product_import', true, NOW(), NOW())
       ON DUPLICATE KEY UPDATE feature_key = feature_key`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ai_credit_purchase_requests");
    await queryInterface.dropTable("ai_feature_settings");
    await queryInterface.dropTable("ai_credit_plans");
    await queryInterface.dropTable("seller_ai_balances");
  },
};
