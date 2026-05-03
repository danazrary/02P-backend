import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

/**
 * Tracks total R2 storage consumed by each seller (in MB).
 * One row per seller – upserted on every upload/delete.
 */
const SellerUsage = sequelize.define(
  "SellerUsage",
  {
    seller_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    storage_used_mb: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "seller_usage",
    timestamps: true,
    updatedAt: "updatedAt",
    createdAt: false, // only updatedAt is useful here
  },
);

export default SellerUsage;
