"use strict";

async function columnExists(queryInterface, tableName, columnName) {
  try {
    const table = await queryInterface.describeTable(tableName);
    return Boolean(table[columnName]);
  } catch {
    return false;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "seller_ai_usage", "request_id"))) {
      await queryInterface.addColumn("seller_ai_usage", "request_id", {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }
    await queryInterface.addIndex("seller_ai_usage", ["request_id"], {
      name: "seller_ai_usage_request_id_lookup",
    }).catch(() => {});
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, "seller_ai_usage", "request_id")) {
      await queryInterface.removeColumn("seller_ai_usage", "request_id");
    }
  },
};
