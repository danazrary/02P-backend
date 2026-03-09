import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Question = sequelize.define(
  "Question",
  {
    titleKu: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    titleAr: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    descriptionKu: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    descriptionAr: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    youtubeUrlKu: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    youtubeUrlAr: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "questions",
  },
);

export default Question;
