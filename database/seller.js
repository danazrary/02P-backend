import { DataTypes } from "sequelize";
import sequelize from "./index.js";

const seller = sequelize.define(
  "seller",
  {
    googleId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false, // must have email
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shop_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shop_image: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "seller",
  }
);

export default seller;
