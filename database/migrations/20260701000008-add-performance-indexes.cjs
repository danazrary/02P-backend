"use strict";

/**
 * Migration: Add performance indexes to frequently queried columns.
 *
 * Each index is added only if it does not already exist.
 * No data is modified. Safe for production VPS.
 *
 * Indexes added:
 *   products        → seller_id, category_id, subcategory_id
 *   product_images  → product_id
 *   seller_usage    → (seller_id is already PK – no extra index needed)
 *   seller_plans    → seller_id, plan_id
 *   seller_offers   → seller_id
 */

/** Helper: check if an index already exists on a table */
async function indexExists(queryInterface, table, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name   = ?
       AND index_name   = ?`,
    { replacements: [table, indexName] }
  );
  return rows[0].cnt > 0;
}

/** Helper: check if a table exists */
async function tableExists(queryInterface, table) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    { replacements: [table] }
  );
  return rows[0].cnt > 0;
}

/** Helper: check if a column exists on a table */
async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name   = ?
       AND column_name  = ?`,
    { replacements: [table, column] }
  );
  return rows[0].cnt > 0;
}

module.exports = {
  async up(queryInterface) {
    // ── products table ────────────────────────────────────────────────────
    if (await tableExists(queryInterface, "products")) {
      if (!(await indexExists(queryInterface, "products", "idx_products_seller_id"))) {
        await queryInterface.addIndex("products", ["seller_id"], {
          name: "idx_products_seller_id",
        });
        console.log("✅ Index: products.seller_id");
      }

      if (
        (await columnExists(queryInterface, "products", "category_id")) &&
        !(await indexExists(queryInterface, "products", "idx_products_category_id"))
      ) {
        await queryInterface.addIndex("products", ["category_id"], {
          name: "idx_products_category_id",
        });
        console.log("✅ Index: products.category_id");
      }

      if (
        (await columnExists(queryInterface, "products", "subcategory_id")) &&
        !(await indexExists(queryInterface, "products", "idx_products_subcategory_id"))
      ) {
        await queryInterface.addIndex("products", ["subcategory_id"], {
          name: "idx_products_subcategory_id",
        });
        console.log("✅ Index: products.subcategory_id");
      }
    }

    // ── product_images table ──────────────────────────────────────────────
    if (await tableExists(queryInterface, "product_images")) {
      if (!(await indexExists(queryInterface, "product_images", "idx_product_images_product_id"))) {
        await queryInterface.addIndex("product_images", ["product_id"], {
          name: "idx_product_images_product_id",
        });
        console.log("✅ Index: product_images.product_id");
      }
    }

    // ── seller_plans table ────────────────────────────────────────────────
    if (await tableExists(queryInterface, "seller_plans")) {
      if (!(await indexExists(queryInterface, "seller_plans", "idx_seller_plans_seller_id"))) {
        await queryInterface.addIndex("seller_plans", ["seller_id"], {
          name: "idx_seller_plans_seller_id",
        });
        console.log("✅ Index: seller_plans.seller_id");
      }

      if (!(await indexExists(queryInterface, "seller_plans", "idx_seller_plans_plan_id"))) {
        await queryInterface.addIndex("seller_plans", ["plan_id"], {
          name: "idx_seller_plans_plan_id",
        });
        console.log("✅ Index: seller_plans.plan_id");
      }
    }

    // ── seller_offers table ───────────────────────────────────────────────
    if (await tableExists(queryInterface, "seller_offers")) {
      if (!(await indexExists(queryInterface, "seller_offers", "idx_seller_offers_seller_id"))) {
        await queryInterface.addIndex("seller_offers", ["seller_id"], {
          name: "idx_seller_offers_seller_id",
        });
        console.log("✅ Index: seller_offers.seller_id");
      }
    }

    console.log("✅ All indexes applied");
  },

  async down(queryInterface) {
    const safeRemove = async (table, indexName) => {
      if (
        (await tableExists(queryInterface, table)) &&
        (await indexExists(queryInterface, table, indexName))
      ) {
        await queryInterface.removeIndex(table, indexName);
      }
    };

    await safeRemove("products", "idx_products_seller_id");
    await safeRemove("products", "idx_products_category_id");
    await safeRemove("products", "idx_products_subcategory_id");
    await safeRemove("product_images", "idx_product_images_product_id");
    await safeRemove("seller_plans", "idx_seller_plans_seller_id");
    await safeRemove("seller_plans", "idx_seller_plans_plan_id");
    await safeRemove("seller_offers", "idx_seller_offers_seller_id");
  },
};
