"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("seller");

    if (!table.password_hash) {
      await queryInterface.addColumn("seller", "password_hash", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!table.email_verified) {
      await queryInterface.addColumn("seller", "email_verified", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!table.verification_code) {
      await queryInterface.addColumn("seller", "verification_code", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!table.code_expires) {
      await queryInterface.addColumn("seller", "code_expires", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("seller");
    if (table.password_hash)     await queryInterface.removeColumn("seller", "password_hash");
    if (table.email_verified)    await queryInterface.removeColumn("seller", "email_verified");
    if (table.verification_code) await queryInterface.removeColumn("seller", "verification_code");
    if (table.code_expires)      await queryInterface.removeColumn("seller", "code_expires");
  },
};
