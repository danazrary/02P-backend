import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

/**
 * Stores individual image keys for products in R2.
 * Replaces the JSON `images` column on the products table for new uploads.
 */
const ProductImage = sequelize.define(
  "ProductImage",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    image_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      comment: "R2 object key for main image (1280px WebP)",
    },
    thumb_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment:
        "R2 object key for thumbnail (300px WebP); null for legacy images",
    },
    is_main: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    size_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Stored WebP size in bytes for storage accounting",
    },
  },
  {
    tableName: "product_images",
    timestamps: true,
  },
);

export default ProductImage;
