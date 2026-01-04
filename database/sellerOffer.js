import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const SellerOffer = sequelize.define(
  "SellerOffer",
  {
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    type_offer: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    language: {
      type: DataTypes.ENUM("kurdish", "arabic", "both"),
      defaultValue: "both",
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

    cover_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    buy_product_id_quantity: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    get_product_id_quantity: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    discount_price_type: {
      type: DataTypes.ENUM("$", "IQD"),
      allowNull: true,
    },

    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    discount_percent: {
      type: DataTypes.DECIMAL(5, 1),
      allowNull: true,
    },

    discount_or_free_delivery: {
      type: DataTypes.ENUM("discount", "free_delivery", "both"),
      allowNull: true,
    },

    apply_to: {
      type: DataTypes.ENUM("all", "selected"),
      allowNull: true,
      defaultValue: "selected",
    },
  },
  {
    timestamps: true,
    tableName: "seller_offers",
  }
);

export default SellerOffer;
