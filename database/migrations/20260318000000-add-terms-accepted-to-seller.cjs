"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller", "terms_accepted_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null, // null means terms not yet accepted
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("seller", "terms_accepted_at");
  },
};
