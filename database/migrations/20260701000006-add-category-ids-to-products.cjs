"use strict";

/**
 * Migration: Add category_id and subcategory_id to the products table.
 *
 * These are NEW nullable integer columns that reference seller_categories.id.
 * They coexist with the old string-based `category` and `subcategory` columns.
 *
 * BACKWARD COMPATIBILITY RULES:
 *   - Both columns are nullable → old products are entirely unaffected.
 *   - Old string `category` / `subcategory` columns are NOT removed.
 *   - Old products continue to render using their existing string columns.
 *   - New products can optionally reference seller_categories rows.
 *   - Frontend reads: if category_id is set → use structured category,
 *     else fall back to string category column.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("products");

    if (!columns.category_id) {
      await queryInterface.addColumn("products", "category_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment:
          "FK to seller_categories.id (NULL = uses legacy string category)",
        after: "subcategory",
      });
      console.log("✅ Added category_id to products");
    } else {
      console.log("⏭️  category_id already exists in products");
    }

    if (!columns.subcategory_id) {
      await queryInterface.addColumn("products", "subcategory_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment:
          "FK to seller_categories.id where parent_id IS NOT NULL (NULL = uses legacy string subcategory)",
        after: "category_id",
      });
      console.log("✅ Added subcategory_id to products");
    } else {
      console.log("⏭️  subcategory_id already exists in products");
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable("products");
    if (columns.category_id) {
      await queryInterface.removeColumn("products", "category_id");
    }
    if (columns.subcategory_id) {
      await queryInterface.removeColumn("products", "subcategory_id");
    }
  },
};
