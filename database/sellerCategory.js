import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

/**
 * SellerCategory model.
 *
 * Represents a structured category (or subcategory) belonging to a seller.
 * Categories form a two-level hierarchy via parent_id:
 *   - parent_id IS NULL  → top-level category
 *   - parent_id IS NOT NULL → subcategory of that category
 *
 * R2 image path convention:
 *   shops/{sellerId}/categories/{uuid}.webp       ← image_key
 *   shops/{sellerId}/categories/{uuid}_thumb.webp ← thumb_key
 *
 * BACKWARD COMPATIBILITY:
 *   The old flat JSON `categories` and `subcategories_map` columns on the
 *   seller table remain unchanged. This model is additive.
 */
const SellerCategory = sequelize.define(
  "SellerCategory",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nameKu: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Category name in Kurdish",
    },
    nameAr: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Category name in Arabic",
    },
    image_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: "R2 object key for category image",
    },
    thumb_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: "R2 object key for category thumbnail (300px WebP)",
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "NULL = top-level category; INT = subcategory of this category",
    },
  },
  {
    tableName: "seller_categories",
    timestamps: true,
  },
);

export default SellerCategory;
