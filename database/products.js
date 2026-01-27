import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Product = sequelize.define(
  "Product",
  {
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

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
    discountStartDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    discountEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    hasRealPrice: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    variantPrices: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    variantPricesAr: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    customInputs: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    customInputsAr: {
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
  },
);

export default Product;
