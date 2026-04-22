"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("products");

    if (!tableDescription.tiktokUrl) {
      await queryInterface.addColumn("products", "tiktokUrl", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!tableDescription.tiktokUsername) {
      await queryInterface.addColumn("products", "tiktokUsername", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!tableDescription.tiktokVideoId) {
      await queryInterface.addColumn("products", "tiktokVideoId", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "tiktokUrl");
    await queryInterface.removeColumn("products", "tiktokUsername");
    await queryInterface.removeColumn("products", "tiktokVideoId");
  },
};
