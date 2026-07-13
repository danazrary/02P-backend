import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const AiCreditPlan = sequelize.define(
  "AiCreditPlan",
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    credits: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    price_iqd: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "ai_credit_plans",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["name"] },
      { fields: ["is_active", "sort_order"] },
    ],
  },
);

export default AiCreditPlan;
