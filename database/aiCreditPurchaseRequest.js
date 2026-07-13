import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const AiCreditPurchaseRequest = sequelize.define(
  "AiCreditPurchaseRequest",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    request_code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: false },
    plan_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    plan_name_snapshot: { type: DataTypes.STRING(80), allowNull: false },
    credits_snapshot: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    price_iqd_snapshot: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },
    agreement_accepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    approved_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    rejected_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "ai_credit_purchase_requests",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["request_code"] },
      { fields: ["seller_id", "plan_id", "status", "createdAt"] },
      { fields: ["status", "createdAt"] },
    ],
  },
);

export default AiCreditPurchaseRequest;
