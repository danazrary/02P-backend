"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("seller");
    if (!table.brand_color) {
      await queryInterface.addColumn("seller", "brand_color", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("seller");
    if (table.brand_color) {
      await queryInterface.removeColumn("seller", "brand_color");
    }
  },
};
