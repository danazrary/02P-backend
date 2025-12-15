import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Plan = sequelize.define(
  "plan",
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
    tableName: "plans",
    timestamps: true,
  }
);

export default Plan;
