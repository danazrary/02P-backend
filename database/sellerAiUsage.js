import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerAiUsage = sequelize.define(
  "SellerAiUsage",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: false },
    request_id: { type: DataTypes.STRING(32), allowNull: true },
    action: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "product_import" },
    source_url: { type: DataTypes.STRING(2048), allowNull: false },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "failed" },
    failure_stage: { type: DataTypes.STRING(60), allowNull: true },
    failure_code: { type: DataTypes.STRING(80), allowNull: true },
    input_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    output_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    total_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    model_name: { type: DataTypes.STRING(80), allowNull: true },
    gemini_request_sent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    seller_credit_consumed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    source_marketplace: { type: DataTypes.STRING(40), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    estimated_input_cost_usd: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
    estimated_output_cost_usd: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
  },
  {
    tableName: "seller_ai_usage",
    timestamps: true,
    indexes: [
      { fields: ["seller_id", "action", "createdAt"] },
      { fields: ["seller_id", "status", "createdAt"] },
      { fields: ["request_id"] },
    ],
  },
);

export default SellerAiUsage;