import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: "Human-readable order ID like ORD-10001",
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    customer_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    customer_phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    customer_city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    customer_location_detail: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    customer_contact_preference: {
      type: DataTypes.ENUM("whatsapp", "viber", "call"),
      allowNull: false,
      defaultValue: "whatsapp",
    },
    payment_method: {
      type: DataTypes.ENUM("COD", "Card"),
      defaultValue: "COD",
      allowNull: false,
    },
    currency: {
      type: DataTypes.ENUM("IQD", "USD", "MIXED"),
      defaultValue: "IQD",
      allowNull: false,
    },
    subtotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    delivery_fee: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    discount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_price: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "accepted",
        "shipping",
        "completed",
        "canceled",
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "orders",
    indexes: [
      { fields: ["seller_id"] },
      { fields: ["status"] },
      { fields: ["createdAt"] },
      { fields: ["order_id"] },
    ],
  },
);

export default Order;
