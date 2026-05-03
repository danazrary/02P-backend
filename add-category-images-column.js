// One-time migration script: adds category_images column to seller table
import sequelize from "./database/sequelize.js";

async function migrate() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = await import("sequelize");

  try {
    await qi.addColumn("seller", "category_images", {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    });
    console.log("✅ Added column: seller.category_images");
  } catch (err) {
    if (err.message?.includes("Duplicate column")) {
      console.log("ℹ️  Column already exists, skipping.");
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
