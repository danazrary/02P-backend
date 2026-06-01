"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_push_subscriptions'`,
    );

    if (rows[0].cnt > 0) {
      console.log(
        "⏭️  seller_push_subscriptions table already exists - skipping",
      );
      return;
    }

    await queryInterface.createTable("seller_push_subscriptions", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      seller_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      endpoint: {
        type: Sequelize.STRING(1024),
        allowNull: false,
        unique: true,
      },
      endpoint_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      subscription: {
        type: Sequelize.JSON,
        allowNull: false,
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
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ),
      },
    });

    await queryInterface.addIndex("seller_push_subscriptions", ["seller_id"]);
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'seller_push_subscriptions'`,
    );

    if (rows[0].cnt > 0) {
      await queryInterface.dropTable("seller_push_subscriptions");
    }
  },
};
