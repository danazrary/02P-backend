import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

// Generate random 6-digit ID
const generate6DigitId = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

const SellerOffer = sequelize.define(
  "SellerOffer",
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
    hooks: {
      beforeValidate: async (offer) => {
        if (!offer.id) {
          for (let attempt = 0; attempt < 100; attempt++) {
            const uniqueId = generate6DigitId();
            const existing = await SellerOffer.findByPk(uniqueId);
            if (!existing) {
              offer.id = uniqueId;
              return;
            }
          }
          throw new Error("Failed to generate unique offer ID");
        }
      },
    },
  },
);

export default SellerOffer;
