"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("orders");

    if (!tableDescription.customer_contact_preference) {
      await queryInterface.addColumn("orders", "customer_contact_preference", {
        type: Sequelize.ENUM("whatsapp", "viber", "call"),
        allowNull: false,
        defaultValue: "whatsapp",
        after: "customer_location_detail",
      });
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("orders");

    if (tableDescription.customer_contact_preference) {
      await queryInterface.removeColumn(
        "orders",
        "customer_contact_preference",
      );
    }
  },
};
