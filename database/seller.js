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
    tiktokId: { type: DataTypes.STRING, unique: true, allowNull: true },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true, // allow null for OAuth users until added
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verification_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    code_expires: {
      type: DataTypes.DATE,
      allowNull: true,
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
    red_lineAr: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    brand_color: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null, // null means use default brand color
    },
    terms_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null, // null means terms not yet accepted
    },
    deletion_requested_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null, // null means no deletion requested, timestamp means account scheduled for deletion after 30 days
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    shop_location: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    categories: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null, // Array of category strings, e.g. ["phones", "home decor"]
    },
  },
  {
    timestamps: true,
    tableName: "seller",
  },
);

export default Seller;
