"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("order_items");

    if (!tableDescription.variant_options_snapshot) {
      await queryInterface.addColumn(
        "order_items",
        "variant_options_snapshot",
        {
          type: Sequelize.TEXT,
          allowNull: true,
          after: "size",
        },
      );
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("order_items");

    if (tableDescription.variant_options_snapshot) {
      await queryInterface.removeColumn(
        "order_items",
        "variant_options_snapshot",
      );
    }
  },
};
