"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");

    if (!table.freeDeliveryStartDate) {
      await queryInterface.addColumn("products", "freeDeliveryStartDate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.freeDeliveryEndDate) {
      await queryInterface.addColumn("products", "freeDeliveryEndDate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // Data migration: only run if all referenced columns are present
    const updated = await queryInterface.describeTable("products");
    const canMigrate =
      updated.freeDeliveryStartDate &&
      updated.freeDeliveryEndDate &&
      updated.discountStartDate &&
      updated.discountEndDate &&
      updated.free_delivery &&
      updated.hasDiscount;

    if (canMigrate) {
      await queryInterface.sequelize.query(`
        UPDATE products
        SET freeDeliveryStartDate = discountStartDate,
            freeDeliveryEndDate   = discountEndDate
        WHERE free_delivery = true
          AND discountStartDate IS NOT NULL
          AND discountEndDate IS NOT NULL
          AND hasDiscount = false
          AND freeDeliveryStartDate IS NULL;
      `);

      await queryInterface.sequelize.query(`
        UPDATE products
        SET discountStartDate = NULL,
            discountEndDate   = NULL
        WHERE free_delivery = true
          AND hasDiscount = false
          AND freeDeliveryStartDate IS NOT NULL;
      `);
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("products");
    if (table.freeDeliveryStartDate) {
      await queryInterface.removeColumn("products", "freeDeliveryStartDate");
    }
    if (table.freeDeliveryEndDate) {
      await queryInterface.removeColumn("products", "freeDeliveryEndDate");
    }
  },
};
