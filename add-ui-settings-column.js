// One-time migration script: adds ui_settings column to seller table
import sequelize from "./database/sequelize.js";

async function migrate() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = await import("sequelize");

  try {
    await qi.addColumn("seller", "ui_settings", {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    });
    console.log("Added column: seller.ui_settings");
  } catch (err) {
    if (err.message?.includes("Duplicate column")) {
      console.log("Column already exists, skipping.");
    } else {
      throw err;
    }
  } finally {
    await sequelize.close();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
