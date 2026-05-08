"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_offers'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("seller_offers");
    if (!table.cover_image_size_bytes) {
      await queryInterface.addColumn("seller_offers", "cover_image_size_bytes", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Compressed WebP size in bytes stored in R2; 0 if no image",
        after: "cover_image",
      });
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_offers'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("seller_offers");
    if (table.cover_image_size_bytes) {
      await queryInterface.removeColumn(
        "seller_offers",
        "cover_image_size_bytes",
      );
    }
  },
};
