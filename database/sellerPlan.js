import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerPlan = sequelize.define(
  "seller_plan",
  {
    starts_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_trial: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_active: {
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
