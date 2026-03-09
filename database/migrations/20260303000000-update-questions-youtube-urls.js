"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove old youtubeLink column
    await queryInterface.removeColumn("questions", "youtubeLink");

    // Add new language-specific YouTube URL columns
    await queryInterface.addColumn("questions", "youtubeUrlKu", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("questions", "youtubeUrlAr", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove new columns
    await queryInterface.removeColumn("questions", "youtubeUrlKu");
    await queryInterface.removeColumn("questions", "youtubeUrlAr");

    // Re-add old youtubeLink column
    await queryInterface.addColumn("questions", "youtubeLink", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
