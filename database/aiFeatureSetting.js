import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const AiFeatureSetting = sequelize.define(
  "AiFeatureSetting",
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    feature_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    is_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    disabled_reason: { type: DataTypes.STRING(500), allowNull: true },
    disabled_source: { type: DataTypes.STRING(80), allowNull: true },
    disabled_at: { type: DataTypes.DATE, allowNull: true },
    enabled_at: { type: DataTypes.DATE, allowNull: true },
    consecutive_system_failures: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    consecutive_gemini_failures: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    last_failure_at: { type: DataTypes.DATE, allowNull: true },
    last_success_at: { type: DataTypes.DATE, allowNull: true },
    circuit_open_until: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "ai_feature_settings",
    timestamps: true,
    indexes: [{ unique: true, fields: ["feature_key"] }],
  },
);

export default AiFeatureSetting;
