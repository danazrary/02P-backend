import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SubscriptionExtensionLog = sequelize.define(
  "subscription_extension_log",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    seller_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: "sellers",
        key: "id",
      },
    },
    seller_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    previous_expiration_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    days_added: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[30, 60, 90]],
      },
    },
    new_expiration_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    admin_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
    },
    admin_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "subscription_extension_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

export default SubscriptionExtensionLog;
