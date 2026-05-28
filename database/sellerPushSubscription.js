import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerPushSubscription = sequelize.define(
  "SellerPushSubscription",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    endpoint: {
      type: DataTypes.STRING(1024),
      allowNull: false,
      unique: true,
    },
    endpoint_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    subscription: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    tableName: "seller_push_subscriptions",
    indexes: [
      { fields: ["seller_id"] },
      { unique: true, fields: ["endpoint"] },
      { unique: true, fields: ["endpoint_hash"] },
    ],
  },
);

export default SellerPushSubscription;
