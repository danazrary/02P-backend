"use strict";

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable("seller");
    if (columns.seller_web_lang) {
      await queryInterface.removeColumn("seller", "seller_web_lang");
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("seller");
    if (!columns.seller_web_lang) {
      await queryInterface.addColumn("seller", "seller_web_lang", {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "ku",
      });
    }
  },
};
