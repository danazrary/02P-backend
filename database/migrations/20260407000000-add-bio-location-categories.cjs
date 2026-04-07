"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add bio to seller table
    await queryInterface.addColumn("seller", "bio", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    // Add shop_location to seller table
    await queryInterface.addColumn("seller", "shop_location", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    // Add categories (JSON) to seller table
    await queryInterface.addColumn("seller", "categories", {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
    });

    // Add category to products table
    await queryInterface.addColumn("products", "category", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("seller", "bio");
    await queryInterface.removeColumn("seller", "shop_location");
    await queryInterface.removeColumn("seller", "categories");
    await queryInterface.removeColumn("products", "category");
  },
};
