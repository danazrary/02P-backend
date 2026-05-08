"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("seller");
    if (!table.red_lineAr) {
      await queryInterface.addColumn("seller", "red_lineAr", {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("seller");
    if (table.red_lineAr) {
      await queryInterface.removeColumn("seller", "red_lineAr");
    }
  },
};
