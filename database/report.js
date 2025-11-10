import { DataTypes } from "sequelize";
import sequelize from "./index.js";

const Report = sequelize.define(
  "report",
  {
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    report_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    shopVisitors: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    productViews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    orders: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
    tableName: "reports",
  }
);

export default Report;
