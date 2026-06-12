import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const HelpTranslation = sequelize.define(
  "HelpTranslation",
  {
    help_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    language: {
      type: DataTypes.ENUM("ku", "ar", "en"),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    answer: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
  },
  {
    tableName: "help_translations",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

export default HelpTranslation;
