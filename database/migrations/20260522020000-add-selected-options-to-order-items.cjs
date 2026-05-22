"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("order_items");

    if (!tableDescription.selected_options) {
      await queryInterface.addColumn("order_items", "selected_options", {
        type: Sequelize.JSON,
        allowNull: true,
        after: "variant_options_snapshot",
      });
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("order_items");

    if (tableDescription.selected_options) {
      await queryInterface.removeColumn("order_items", "selected_options");
    }
  },
};
