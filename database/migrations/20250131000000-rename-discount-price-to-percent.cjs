"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");

    // Rename only if old column exists and new column does not
    if (table.discountPrice && !table.discount_percent) {
      await queryInterface.renameColumn(
        "products",
        "discountPrice",
        "discount_percent",
      );
    }

    // Change type only if the target column now exists
    const updated = await queryInterface.describeTable("products");
    if (updated.discount_percent) {
      await queryInterface.changeColumn("products", "discount_percent", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("products");

    if (table.discount_percent) {
      await queryInterface.changeColumn("products", "discount_percent", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }

    // Rename back only if discount_percent exists and discountPrice does not
    const updated = await queryInterface.describeTable("products");
    if (updated.discount_percent && !updated.discountPrice) {
      await queryInterface.renameColumn(
        "products",
        "discount_percent",
        "discountPrice",
      );
    }
  },
};
