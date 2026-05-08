"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const seller = await queryInterface.describeTable("seller");

    if (!seller.bio) {
      await queryInterface.addColumn("seller", "bio", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!seller.shop_location) {
      await queryInterface.addColumn("seller", "shop_location", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!seller.categories) {
      await queryInterface.addColumn("seller", "categories", {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      });
    }

    const products = await queryInterface.describeTable("products");
    if (!products.category) {
      await queryInterface.addColumn("products", "category", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const seller = await queryInterface.describeTable("seller");
    if (seller.bio)           await queryInterface.removeColumn("seller", "bio");
    if (seller.shop_location) await queryInterface.removeColumn("seller", "shop_location");
    if (seller.categories)    await queryInterface.removeColumn("seller", "categories");

    const products = await queryInterface.describeTable("products");
    if (products.category)    await queryInterface.removeColumn("products", "category");
  },
};
