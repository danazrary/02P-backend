"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller", "brand_color", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null, // null means use default brand color
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("seller", "brand_color");
  },
};
