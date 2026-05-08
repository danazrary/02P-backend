"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'product_images'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("product_images");
    if (!table.thumb_key) {
      await queryInterface.addColumn("product_images", "thumb_key", {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment:
          "R2 object key for thumbnail (300px WebP); null for legacy images",
        after: "image_key",
      });
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'product_images'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("product_images");
    if (table.thumb_key) {
      await queryInterface.removeColumn("product_images", "thumb_key");
    }
  },
};
