"use strict";

async function columnExists(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function addColumnIfMissing(queryInterface, Sequelize, tableName, columnName, definition) {
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "status", {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: "failed",
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "failure_stage", {
      type: Sequelize.STRING(60),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "failure_code", {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "input_tokens", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "output_tokens", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "total_tokens", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "model_name", {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "gemini_request_sent", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "seller_credit_consumed", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "source_marketplace", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "duration_ms", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "estimated_input_cost_usd", {
      type: Sequelize.DECIMAL(12, 6),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, Sequelize, "seller_ai_usage", "estimated_output_cost_usd", {
      type: Sequelize.DECIMAL(12, 6),
      allowNull: true,
    });

    await queryInterface.addIndex("seller_ai_usage", ["seller_id", "status", "createdAt"], {
      name: "seller_ai_usage_status_lookup",
    }).catch(() => {});
  },

  async down(queryInterface) {
    const columns = [
      "estimated_output_cost_usd",
      "estimated_input_cost_usd",
      "duration_ms",
      "source_marketplace",
      "seller_credit_consumed",
      "gemini_request_sent",
      "model_name",
      "total_tokens",
      "output_tokens",
      "input_tokens",
      "failure_code",
      "failure_stage",
      "status",
    ];
    for (const column of columns) {
      if (await columnExists(queryInterface, "seller_ai_usage", column)) {
        await queryInterface.removeColumn("seller_ai_usage", column);
      }
    }
  },
};
