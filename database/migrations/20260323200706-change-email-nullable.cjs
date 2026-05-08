'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // No-op: email nullability is enforced at the application/model level.
  },

  async down(queryInterface, Sequelize) {
    // No-op
  }
};
