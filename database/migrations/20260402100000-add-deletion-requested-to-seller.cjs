"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller", "deletion_requested_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null, // null means no deletion requested
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("seller", "deletion_requested_at");
  },
};
