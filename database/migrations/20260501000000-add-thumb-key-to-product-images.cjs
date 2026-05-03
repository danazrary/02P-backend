"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("product_images", "thumb_key", {
      type: Sequelize.STRING(512),
      allowNull: true,
      comment:
        "R2 object key for thumbnail (300px WebP); null for legacy images",
      after: "image_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("product_images", "thumb_key");
  },
};
