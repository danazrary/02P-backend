"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("seller");
    if (!table.terms_accepted_at) {
      await queryInterface.addColumn("seller", "terms_accepted_at", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("seller");
    if (table.terms_accepted_at) {
      await queryInterface.removeColumn("seller", "terms_accepted_at");
    }
  },
};
