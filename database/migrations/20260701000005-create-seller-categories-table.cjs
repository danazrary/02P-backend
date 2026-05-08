"use strict";

/**
 * Migration: Create seller_categories table.
 *
 * This is a NEW structured table that replaces the flat JSON `categories`
 * column on the seller table for future category/subcategory management.
 *
 * Schema:
 *   - id           → PK, auto-increment
 *   - seller_id    → which seller owns this category
 *   - nameKu       → category name in Kurdish
 *   - nameAr       → category name in Arabic
 *   - image_key    → R2 key for category image (main)
 *   - thumb_key    → R2 key for category thumbnail (300px WebP, nullable)
 *   - parent_id    → NULL = top-level category, INT = subcategory
 *   - createdAt / updatedAt
 *
 * BACKWARD COMPATIBILITY:
 *   - Old JSON-based categories (seller.categories / seller.subcategories_map)
 *     remain intact. This table is additive.
 *   - Old products using string `category` / `subcategory` columns
 *     continue to work without changes.
 *   - New category_id / subcategory_id columns on products (added by the
 *     next migration) are nullable, so old products are unaffected.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_categories'`
    );

    if (rows[0].cnt > 0) {
      console.log("⏭️  seller_categories table already exists – skipping");
      return;
    }

    await queryInterface.createTable("seller_categories", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      seller_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "FK to seller.id",
      },
      nameKu: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: "Category name in Kurdish",
      },
      nameAr: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: "Category name in Arabic",
      },
      image_key: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: "R2 object key for category image",
      },
      thumb_key: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: "R2 object key for category thumbnail (300px WebP)",
      },
      parent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: "NULL = top-level category; INT = subcategory of parent_id",
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

    // Index for fast lookup by seller
    await queryInterface.addIndex("seller_categories", ["seller_id"], {
      name: "idx_seller_categories_seller_id",
    });

    // Index for subcategory lookup
    await queryInterface.addIndex("seller_categories", ["parent_id"], {
      name: "idx_seller_categories_parent_id",
    });

    console.log("✅ Created seller_categories table");
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_categories'`
    );
    if (rows[0].cnt === 0) return;

    const [data] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS cnt FROM seller_categories"
    );
    if (data[0].cnt === 0) {
      await queryInterface.dropTable("seller_categories");
    }
  },
};
