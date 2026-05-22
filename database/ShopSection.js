import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const ShopSection = sequelize.define(
  "ShopSection",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    section_key: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    is_visible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    config: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "shop_sections",
    indexes: [
      {
        unique: true,
        fields: ["seller_id", "section_key"],
        name: "shop_sections_seller_key_unique",
      },
    ],
  },
);

export default ShopSection;
