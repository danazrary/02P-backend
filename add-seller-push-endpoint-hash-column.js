// One-time migration script: adds endpoint_hash to seller_push_subscriptions
import { DataTypes } from "sequelize";
import sequelize from "./database/sequelize.js";

const TABLE_NAME = "seller_push_subscriptions";
const COLUMN_NAME = "endpoint_hash";
const INDEX_NAME = "seller_push_subscriptions_endpoint_hash_unique";

async function tableExists(queryInterface) {
  try {
    await queryInterface.describeTable(TABLE_NAME);
    return true;
  } catch (error) {
    if (
      error?.name === "SequelizeDatabaseError" &&
      /doesn't exist|unknown table/i.test(error?.message || "")
    ) {
      return false;
    }
    throw error;
  }
}

async function columnExists(queryInterface) {
  const table = await queryInterface.describeTable(TABLE_NAME);
  return Boolean(table[COLUMN_NAME]);
}

async function uniqueEndpointHashIndexExists(queryInterface) {
  const indexes = await queryInterface.showIndex(TABLE_NAME);
  return indexes.some((index) => {
    const fields = index.fields?.map((field) => field.attribute) || [];
    return index.unique && fields.length === 1 && fields[0] === COLUMN_NAME;
  });
}

async function migrate() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    if (!(await tableExists(queryInterface))) {
      console.log(`${TABLE_NAME} table does not exist, skipping.`);
      return;
    }

    if (!(await columnExists(queryInterface))) {
      await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
      console.log(`Added column: ${TABLE_NAME}.${COLUMN_NAME}`);

      await sequelize.query(
        `UPDATE ${TABLE_NAME}
         SET ${COLUMN_NAME} = SHA2(endpoint, 256)
         WHERE ${COLUMN_NAME} IS NULL`,
      );
      console.log(`Backfilled ${TABLE_NAME}.${COLUMN_NAME}`);

      await queryInterface.changeColumn(TABLE_NAME, COLUMN_NAME, {
        type: DataTypes.STRING(64),
        allowNull: false,
      });
      console.log(`Set ${TABLE_NAME}.${COLUMN_NAME} to NOT NULL`);
    } else {
      console.log(`Column already exists: ${TABLE_NAME}.${COLUMN_NAME}`);
    }

    if (!(await uniqueEndpointHashIndexExists(queryInterface))) {
      await queryInterface.addIndex(TABLE_NAME, [COLUMN_NAME], {
        unique: true,
        name: INDEX_NAME,
      });
      console.log(`Added unique index: ${INDEX_NAME}`);
    } else {
      console.log(`Unique index already exists for ${TABLE_NAME}.${COLUMN_NAME}`);
    }
  } finally {
    await sequelize.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
