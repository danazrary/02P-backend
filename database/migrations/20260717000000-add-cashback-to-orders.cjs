"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const orders = await queryInterface.describeTable("orders");
    if (!orders.cashback) {
      await queryInterface.addColumn("orders", "cashback", {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    const orderItems = await queryInterface.describeTable("order_items");
    if (!orderItems.cashback_amount) {
      await queryInterface.addColumn("order_items", "cashback_amount", {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const orderItems = await queryInterface.describeTable("order_items");
    if (orderItems.cashback_amount) {
      await queryInterface.removeColumn("order_items", "cashback_amount");
    }

    const orders = await queryInterface.describeTable("orders");
    if (orders.cashback) {
      await queryInterface.removeColumn("orders", "cashback");
    }
  },
};