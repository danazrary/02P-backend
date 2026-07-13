"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).some((table) => table.toLowerCase() === "seller_ai_usage")) return;
    await queryInterface.createTable("seller_ai_usage", {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
      seller_id: { type: Sequelize.INTEGER, allowNull: false },
      action: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "product_import" },
      source_url: { type: Sequelize.STRING(2048), allowNull: false },
      success: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("seller_ai_usage", ["seller_id", "action", "createdAt"], { name: "seller_ai_usage_monthly_lookup" });
  },
  async down(queryInterface) { await queryInterface.dropTable("seller_ai_usage"); },
};
