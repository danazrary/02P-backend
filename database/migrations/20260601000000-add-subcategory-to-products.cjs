"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "subcategory", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
      after: "category",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "subcategory");
  },
};
