import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerPlan = sequelize.define(
  "seller_plan",
  {
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_trial: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "seller_plans",
    timestamps: true,
  }
);

export default SellerPlan;
