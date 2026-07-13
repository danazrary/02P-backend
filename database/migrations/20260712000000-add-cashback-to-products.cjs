"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");

    if (!table.hasCashback) {
      await queryInterface.addColumn("products", "hasCashback", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!table.cashbackType) {
      await queryInterface.addColumn("products", "cashbackType", {
        type: Sequelize.ENUM("percentage", "fixed"),
        allowNull: false,
        defaultValue: "percentage",
      });
    }

    if (!table.cashbackValue) {
      await queryInterface.addColumn("products", "cashbackValue", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    if (!table.cashbackStartDate) {
      await queryInterface.addColumn("products", "cashbackStartDate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.cashbackEndDate) {
      await queryInterface.addColumn("products", "cashbackEndDate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.cashbackMinOrderAmount) {
      await queryInterface.addColumn("products", "cashbackMinOrderAmount", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("products");

    if (table.cashbackMinOrderAmount) {
      await queryInterface.removeColumn("products", "cashbackMinOrderAmount");
    }
    if (table.cashbackEndDate) {
      await queryInterface.removeColumn("products", "cashbackEndDate");
    }
    if (table.cashbackStartDate) {
      await queryInterface.removeColumn("products", "cashbackStartDate");
    }
    if (table.cashbackValue) {
      await queryInterface.removeColumn("products", "cashbackValue");
    }
    if (table.cashbackType) {
      await queryInterface.removeColumn("products", "cashbackType");
    }
    if (table.hasCashback) {
      await queryInterface.removeColumn("products", "hasCashback");
    }
  },
};
