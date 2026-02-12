import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Seller = sequelize.define(
  "seller",
  {
    googleId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    facebookId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false, // must have email
    },
    needsManualEmail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shop_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shop_image: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    social_links: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        instagram: null,
        facebook: null,
        tiktok: null,
        youtube: null,
        x: null,
        snapchat: null,
        threads: null,
        telegram: null,
        whatsapp: null,
        viber: null,
      },
    },

    red_line: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    brand_color: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null, // null means use default brand color
    },
  },
  {
    timestamps: true,
    tableName: "seller",
  },
);

export default Seller;
