"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("products");

    if (!tableDescription.options) {
      await queryInterface.addColumn("products", "options", {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }

    if (!tableDescription.variants) {
      await queryInterface.addColumn("products", "variants", {
        type: Sequelize.JSON,
        allowNull: true,
        after: "options",
      });
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("products");

    if (tableDescription.variants) {
      await queryInterface.removeColumn("products", "variants");
    }

    if (tableDescription.options) {
      await queryInterface.removeColumn("products", "options");
    }
  },
};
