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
    if (!(await tableExists(queryInterface, "subscription_extension_logs"))) {
      await queryInterface.createTable("subscription_extension_logs", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        seller_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: {
            model: "sellers",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        seller_name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        previous_expiration_date: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        days_added: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        new_expiration_date: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        admin_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: {
            model: "admins",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        admin_email: {
          type: Sequelize.STRING(255),
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

      // Add indexes for better query performance
      await queryInterface.addIndex("subscription_extension_logs", [
        "seller_id",
      ]);
      await queryInterface.addIndex("subscription_extension_logs", [
        "admin_id",
      ]);
      await queryInterface.addIndex("subscription_extension_logs", [
        "created_at",
      ]);
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "subscription_extension_logs")) {
      await queryInterface.dropTable("subscription_extension_logs");
    }
  },
};
