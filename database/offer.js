import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Offer = sequelize.define(
  "offer",
  {
    name: {
      type: DataTypes.STRING(50), // use STRING instead of ENUM
      allowNull: false,
    },
    billing_cycle: {
      type: DataTypes.STRING(20), // use STRING instead of ENUM
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    max_products: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "offers",
    timestamps: true,
  }
);

export default Offer;
