"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add freeDeliveryStartDate column
    await queryInterface.addColumn("products", "freeDeliveryStartDate", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add freeDeliveryEndDate column
    await queryInterface.addColumn("products", "freeDeliveryEndDate", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Optional: Migrate existing data from discountStartDate/discountEndDate to freeDeliveryStartDate/freeDeliveryEndDate
    // for products that have free_delivery = true
    await queryInterface.sequelize.query(`
      UPDATE products 
      SET freeDeliveryStartDate = discountStartDate,
          freeDeliveryEndDate = discountEndDate
      WHERE free_delivery = true 
        AND discountStartDate IS NOT NULL 
        AND discountEndDate IS NOT NULL
        AND hasDiscount = false;
    `);

    // Clear discount dates for products that only have free delivery (not both)
    await queryInterface.sequelize.query(`
      UPDATE products 
      SET discountStartDate = NULL,
          discountEndDate = NULL
      WHERE free_delivery = true 
        AND hasDiscount = false
        AND freeDeliveryStartDate IS NOT NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove the new columns
    await queryInterface.removeColumn("products", "freeDeliveryStartDate");
    await queryInterface.removeColumn("products", "freeDeliveryEndDate");
  },
};
