"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, rename the column
    await queryInterface.renameColumn(
      "products",
      "discountPrice",
      "discount_percent",
    );

    // Then change the type from DECIMAL to INTEGER
    await queryInterface.changeColumn("products", "discount_percent", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // First, change the type back to DECIMAL
    await queryInterface.changeColumn("products", "discount_percent", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    // Then rename back to discountPrice
    await queryInterface.renameColumn(
      "products",
      "discount_percent",
      "discountPrice",
    );
  },
};
