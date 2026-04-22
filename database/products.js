import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

// Generate random 6-digit ID
const generate6DigitId = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
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
    discount_percent: {
      type: DataTypes.INTEGER,
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
    freeDeliveryStartDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    freeDeliveryEndDate: {
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
    free_delivery: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    tiktokUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    tiktokUsername: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    tiktokVideoId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    tableName: "products",
    hooks: {
      beforeValidate: async (product) => {
        if (!product.id) {
          for (let attempt = 0; attempt < 100; attempt++) {
            const uniqueId = generate6DigitId();
            const existing = await Product.findByPk(uniqueId);
            if (!existing) {
              product.id = uniqueId;
              return;
            }
          }
          throw new Error("Failed to generate unique product ID");
        }
      },
    },
  },
);

export default Product;
