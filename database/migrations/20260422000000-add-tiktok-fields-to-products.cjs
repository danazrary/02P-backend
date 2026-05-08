"use strict";

/**
 * Migration: Add TikTok-related fields to products table.
 * Each column is added only when absent – safe to run multiple times.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");

    if (!table.tiktok_url) {
      await queryInterface.addColumn("products", "tiktok_url", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "TikTok video URL for this product",
      });
    }

    if (!table.tiktok_embed_id) {
      await queryInterface.addColumn("products", "tiktok_embed_id", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "TikTok video embed ID extracted from the URL",
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("products");
    if (table.tiktok_url)      await queryInterface.removeColumn("products", "tiktok_url");
    if (table.tiktok_embed_id) await queryInterface.removeColumn("products", "tiktok_embed_id");
  },
};
