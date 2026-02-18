import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Feedback = sequelize.define(
  "feedback",
  {
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5,
      },
    },

    type: {
      type: DataTypes.STRING, // <-- flexible now
      allowNull: false,
      defaultValue: "other",
    },
  },
  {
    timestamps: true,
    tableName: "feedbacks",
  },
);

export default Feedback;
