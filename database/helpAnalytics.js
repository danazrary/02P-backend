import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const HelpAnalytics = sequelize.define(
  "HelpAnalytics",
  {
    help_item_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    event_type: {
      type: DataTypes.ENUM("question_open", "search", "helpful", "not_helpful"),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "help_analytics",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export default HelpAnalytics;
