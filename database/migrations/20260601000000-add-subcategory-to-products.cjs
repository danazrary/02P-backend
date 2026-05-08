"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");
    if (!table.subcategory) {
      await queryInterface.addColumn("products", "subcategory", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
        after: "category",
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("products");
    if (table.subcategory) {
      await queryInterface.removeColumn("products", "subcategory");
    }
  },
};
