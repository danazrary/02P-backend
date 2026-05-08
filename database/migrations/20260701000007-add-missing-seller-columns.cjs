"use strict";

/**
 * Migration: Add missing columns to the seller table.
 *
 * Columns that exist in the Seller model (database/seller.js) but may be
 * absent on a VPS database that was originally created with sequelize.sync()
 * before these fields were added to the model.
 *
 * Each column is only added when it is not already present.
 * No existing data is modified.
 *
 * Columns handled:
 *   - tiktokId          (STRING, unique, nullable)
 *   - needsManualEmail  (BOOLEAN, default false)
 *   - category_images   (JSON, nullable) – per-category R2 image map
 *   - default_shop_lang (STRING, default 'ku') – shop display language
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("seller");

    // ── tiktokId ─────────────────────────────────────────────────────────
    if (!columns.tiktokId) {
      await queryInterface.addColumn("seller", "tiktokId", {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
        defaultValue: null,
        comment: "TikTok OAuth ID",
      });
      console.log("✅ Added tiktokId to seller");
    } else {
      console.log("⏭️  tiktokId already exists in seller");
    }

    // ── needsManualEmail ─────────────────────────────────────────────────
    if (!columns.needsManualEmail) {
      await queryInterface.addColumn("seller", "needsManualEmail", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          "True when OAuth user must supply an email to complete registration",
      });
      console.log("✅ Added needsManualEmail to seller");
    } else {
      console.log("⏭️  needsManualEmail already exists in seller");
    }

    // ── category_images ──────────────────────────────────────────────────
    if (!columns.category_images) {
      await queryInterface.addColumn("seller", "category_images", {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
        comment:
          'Map of category name → R2 image key, e.g. {"phones": "shops/1/categories/uuid.webp"}',
      });
      console.log("✅ Added category_images to seller");
    } else {
      console.log("⏭️  category_images already exists in seller");
    }

    // ── default_shop_lang ────────────────────────────────────────────────
    if (!columns.default_shop_lang) {
      await queryInterface.addColumn("seller", "default_shop_lang", {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "ku",
        comment: '"ku" = Kurdish (default), "ar" = Arabic',
      });
      console.log("✅ Added default_shop_lang to seller");
    } else {
      console.log("⏭️  default_shop_lang already exists in seller");
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("seller");
    if (columns.tiktokId)         await queryInterface.removeColumn("seller", "tiktokId");
    if (columns.needsManualEmail) await queryInterface.removeColumn("seller", "needsManualEmail");
    if (columns.category_images)  await queryInterface.removeColumn("seller", "category_images");
    if (columns.default_shop_lang) await queryInterface.removeColumn("seller", "default_shop_lang");
  },
};
