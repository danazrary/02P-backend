import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const HelpItem = sequelize.define(
  "HelpItem",
  {
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "help_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

export default HelpItem;
