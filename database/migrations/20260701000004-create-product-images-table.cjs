"use strict";

/**
 * Migration: Create product_images table if it does not already exist.
 *
 * Mirrors the ProductImage model (database/productImages.js).
 * Supports the R2 image structure:
 *   shops/{sellerId}/products/{productId}/main/  → image_key
 *   shops/{sellerId}/products/{productId}/thumb/ → thumb_key
 *
 * BACKWARD COMPATIBILITY:
 *   - thumb_key is nullable so legacy images (no thumbnail) continue working.
 *   - Old products still use the `images` JSON column on the products table.
 *     product_images rows are only created for new R2 uploads.
 *
 * Note: This migration also adds thumb_key if the table already exists
 *       but is missing that column (handles partial VPS state).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'product_images'`
    );

    if (rows[0].cnt === 0) {
      // ── Create fresh table ────────────────────────────────────
      await queryInterface.createTable("product_images", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: "FK to products.id",
        },
        image_key: {
          type: Sequelize.STRING(512),
          allowNull: false,
          comment: "R2 object key for main image (1280px WebP)",
        },
        thumb_key: {
          type: Sequelize.STRING(512),
          allowNull: true,
          comment:
            "R2 object key for thumbnail (300px WebP); NULL for legacy images",
        },
        is_main: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
        },
        size_bytes: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: "Stored WebP size in bytes for storage accounting",
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal(
            "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
          ),
        },
      });
      console.log("✅ Created product_images table");
    } else {
      console.log("⏭️  product_images table already exists – checking columns");

      // ── Ensure thumb_key exists on existing table ─────────────
      const columns = await queryInterface.describeTable("product_images");

      if (!columns.thumb_key) {
        await queryInterface.addColumn("product_images", "thumb_key", {
          type: Sequelize.STRING(512),
          allowNull: true,
          comment:
            "R2 object key for thumbnail (300px WebP); NULL for legacy images",
          after: "image_key",
        });
        console.log("✅ Added thumb_key to product_images");
      } else {
        console.log("⏭️  thumb_key already exists in product_images");
      }

      if (!columns.size_bytes) {
        await queryInterface.addColumn("product_images", "size_bytes", {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: "Stored WebP size in bytes for storage accounting",
        });
        console.log("✅ Added size_bytes to product_images");
      }
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'product_images'`
    );
    if (rows[0].cnt === 0) return;

    const [data] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS cnt FROM product_images"
    );
    if (data[0].cnt === 0) {
      await queryInterface.dropTable("product_images");
    }
  },
};
