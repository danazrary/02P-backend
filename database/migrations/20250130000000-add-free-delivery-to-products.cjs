"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");
    if (!table.free_delivery) {
      await queryInterface.addColumn("products", "free_delivery", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("products");
    if (table.free_delivery) {
      await queryInterface.removeColumn("products", "free_delivery");
    }
  },
};
