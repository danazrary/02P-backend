import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const HelpFeedback = sequelize.define(
  "HelpFeedback",
  {
    help_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    feedback_type: {
      type: DataTypes.ENUM("helpful", "not_helpful"),
      allowNull: false,
    },
  },
  {
    tableName: "help_feedback",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export default HelpFeedback;
