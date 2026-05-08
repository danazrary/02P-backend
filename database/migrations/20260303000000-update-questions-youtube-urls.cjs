"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'questions'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("questions");

    if (table.youtubeLink) {
      await queryInterface.removeColumn("questions", "youtubeLink");
    }

    if (!table.youtubeUrlKu) {
      await queryInterface.addColumn("questions", "youtubeUrlKu", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.youtubeUrlAr) {
      await queryInterface.addColumn("questions", "youtubeUrlAr", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'questions'`
    );
    if (rows[0].cnt === 0) return;

    const table = await queryInterface.describeTable("questions");

    if (table.youtubeUrlKu) {
      await queryInterface.removeColumn("questions", "youtubeUrlKu");
    }

    if (table.youtubeUrlAr) {
      await queryInterface.removeColumn("questions", "youtubeUrlAr");
    }

    const updated = await queryInterface.describeTable("questions");
    if (!updated.youtubeLink) {
      await queryInterface.addColumn("questions", "youtubeLink", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },
};
