"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller_offers", "cover_image_size_bytes", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Compressed WebP size in bytes stored in R2; 0 if no image",
      after: "cover_image",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "seller_offers",
      "cover_image_size_bytes",
    );
  },
};
