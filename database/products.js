import { DataTypes } from "sequelize";
import sequelize from "./index.js";

const Product = sequelize.define(
  "Product",
  {
    language: {
      type: DataTypes.ENUM("arabic", "kurdish", "both"),
      defaultValue: "kurdish", // ✅ default is kurdish now
    },
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
    images: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    youtubeLinks: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    realPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    priceType: {
      type: DataTypes.ENUM("USD", "IQD"),
      defaultValue: "USD",
    },
    hasDiscount: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    discountType: {
      type: DataTypes.ENUM("permanent", "timer"),
      allowNull: true,
    },
    discountDays: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    discountHours: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    discountMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    variantPrices: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    customInputs: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
    tableName: "products",
  }
);

export default Product;
