"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller", "password_hash", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("seller", "email_verified", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("seller", "verification_code", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("seller", "code_expires", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("seller", "password_hash");
    await queryInterface.removeColumn("seller", "email_verified");
    await queryInterface.removeColumn("seller", "verification_code");
    await queryInterface.removeColumn("seller", "code_expires");
  },
};
