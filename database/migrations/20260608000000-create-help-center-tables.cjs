"use strict";

async function tableExists(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :tableName`,
    { replacements: { tableName } },
  );

  return Number(rows?.[0]?.cnt || 0) > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "help_items"))) {
      await queryInterface.createTable("help_items", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        parent_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "help_items",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_published: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal(
            "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
          ),
        },
      });

      await queryInterface.addIndex("help_items", ["parent_id", "sort_order"]);
      await queryInterface.addIndex("help_items", ["is_published"]);
    }

    if (!(await tableExists(queryInterface, "help_translations"))) {
      await queryInterface.createTable("help_translations", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        help_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "help_items",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        language: {
          type: Sequelize.ENUM("ku", "ar", "en"),
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        answer: {
          type: Sequelize.TEXT("long"),
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal(
            "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
          ),
        },
      });

      await queryInterface.addIndex("help_translations", {
        fields: ["help_item_id", "language"],
        unique: true,
        name: "help_translations_item_language_unique",
      });
      await queryInterface.addIndex("help_translations", ["language"]);
      await queryInterface.addIndex("help_translations", ["title"]);
    }

    if (!(await tableExists(queryInterface, "help_feedback"))) {
      await queryInterface.createTable("help_feedback", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        help_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "help_items",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        seller_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        feedback_type: {
          type: Sequelize.ENUM("helpful", "not_helpful"),
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });

      await queryInterface.addIndex("help_feedback", [
        "help_item_id",
        "seller_id",
      ]);
      await queryInterface.addIndex("help_feedback", ["feedback_type"]);
    }

    if (!(await tableExists(queryInterface, "help_analytics"))) {
      await queryInterface.createTable("help_analytics", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        help_item_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "help_items",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        seller_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        event_type: {
          type: Sequelize.ENUM(
            "question_open",
            "search",
            "helpful",
            "not_helpful",
          ),
          allowNull: false,
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });

      await queryInterface.addIndex("help_analytics", [
        "event_type",
        "created_at",
      ]);
      await queryInterface.addIndex("help_analytics", [
        "help_item_id",
        "created_at",
      ]);
      await queryInterface.addIndex("help_analytics", [
        "seller_id",
        "created_at",
      ]);
    }
  },

  async down(queryInterface) {
    for (const tableName of [
      "help_analytics",
      "help_feedback",
      "help_translations",
      "help_items",
    ]) {
      if (await tableExists(queryInterface, tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }
  },
};
