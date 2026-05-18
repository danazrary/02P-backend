"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("products");

    if (!tableDescription.stock) {
      await queryInterface.addColumn("products", "stock", {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        after: "subcategory_id",
      });
    }

    if (!tableDescription.isAvailable) {
      await queryInterface.addColumn("products", "isAvailable", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        after: "stock",
      });
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("products");

    if (tableDescription.isAvailable) {
      await queryInterface.removeColumn("products", "isAvailable");
    }

    if (tableDescription.stock) {
      await queryInterface.removeColumn("products", "stock");
    }
  },
};
