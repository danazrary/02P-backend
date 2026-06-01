"use strict";

const TABLE_NAME = "seller_push_subscriptions";
const COLUMN_NAME = "endpoint_hash";
const INDEX_NAME = "seller_push_subscriptions_endpoint_hash_unique";

async function tableExists(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :tableName`,
    { replacements: { tableName: TABLE_NAME } },
  );

  return Number(rows[0].cnt) > 0;
}

async function columnExists(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND column_name = :columnName`,
    { replacements: { tableName: TABLE_NAME, columnName: COLUMN_NAME } },
  );

  return Number(rows[0].cnt) > 0;
}

async function uniqueEndpointHashIndexExists(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND column_name = :columnName
       AND non_unique = 0`,
    { replacements: { tableName: TABLE_NAME, columnName: COLUMN_NAME } },
  );

  return Number(rows[0].cnt) > 0;
}

async function namedIndexExists(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND index_name = :indexName`,
    { replacements: { tableName: TABLE_NAME, indexName: INDEX_NAME } },
  );

  return Number(rows[0].cnt) > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface))) {
      return;
    }

    if (!(await columnExists(queryInterface))) {
      await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
        type: Sequelize.STRING(64),
        allowNull: true,
      });

      await queryInterface.sequelize.query(
        `UPDATE ${TABLE_NAME}
         SET ${COLUMN_NAME} = SHA2(endpoint, 256)
         WHERE ${COLUMN_NAME} IS NULL`,
      );

      await queryInterface.changeColumn(TABLE_NAME, COLUMN_NAME, {
        type: Sequelize.STRING(64),
        allowNull: false,
      });
    }

    if (!(await uniqueEndpointHashIndexExists(queryInterface))) {
      await queryInterface.addIndex(TABLE_NAME, [COLUMN_NAME], {
        unique: true,
        name: INDEX_NAME,
      });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface))) {
      return;
    }

    if (await namedIndexExists(queryInterface)) {
      await queryInterface.removeIndex(TABLE_NAME, INDEX_NAME);
    }

    if (await columnExists(queryInterface)) {
      await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
    }
  },
};
