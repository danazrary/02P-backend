"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("seller");
    if (!table.subcategories_map) {
      await queryInterface.addColumn("seller", "subcategories_map", {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("seller");
    if (table.subcategories_map) {
      await queryInterface.removeColumn("seller", "subcategories_map");
    }
  },
};
