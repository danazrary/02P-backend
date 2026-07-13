import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerAiBalance = sequelize.define(
  "SellerAiBalance",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    credit_balance: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 3,
      validate: { min: 0 },
    },
    total_free_credits: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 3,
    },
    total_purchased: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    total_used: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "seller_ai_balances",
    timestamps: true,
    indexes: [{ unique: true, fields: ["seller_id"] }],
  },
);

export default SellerAiBalance;
