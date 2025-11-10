import { DataTypes } from "sequelize";
import sequelize from "./index.js";

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
    youtubeLink: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "questions",
  }
);

export default Question;
