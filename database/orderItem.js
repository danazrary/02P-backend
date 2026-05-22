import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const OrderItem = sequelize.define(
  "OrderItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "FK to orders.id",
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment:
        "Original product ID — kept for reference; product may be deleted",
    },
    product_name_snapshot: {
      type: DataTypes.STRING(300),
      allowNull: false,
      comment: "Snapshot of product name at purchase time",
    },
    product_image_snapshot: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Snapshot of product image URL at purchase time",
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    size: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    variant_options_snapshot: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "JSON string snapshot of selected dynamic variant options",
    },
    selected_options: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "JSON object of selected options (color/size/taste/dynamic)",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    unit_price: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_price: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.ENUM("IQD", "USD"),
      allowNull: false,
      defaultValue: "IQD",
      comment: "Currency for this specific item's price",
    },
  },
  {
    tableName: "order_items",
    indexes: [{ fields: ["order_id"] }, { fields: ["product_id"] }],
  },
);

export default OrderItem;
