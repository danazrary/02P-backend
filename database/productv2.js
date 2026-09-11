import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const ProductV2 = sequelize.define(
  "ProductV2",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    seller_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    // ناونیشان و وەسف بە چەند زمان (JSON: { ku: "", ar: "", en: "" })
    title: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    description: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // نرخەکان و ژمێریاری
    cost_price: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0, // تێچووی کڕین لە کارگە بۆ ژماردنی قازانجی پوخت
    },
    retail_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false, // نرخی فرۆشتنی تاک
    },

    // تایبەتمەندییەکانی جوملە (Wholesale Engine)
    is_wholesale_only: {
      type: DataTypes.BOOLEAN,
      defaultValue: false, // ئەگەر تەنها بۆ فرۆشتنی کۆ بێت
    },
    wholesale_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true, // نرخی دانەیەک بە کۆ
    },
    min_wholesale_quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 1, // کەمترین بڕی کڕین (MOQ)
    },
    wholesale_tier_pricing: {
      type: DataTypes.JSON,
      allowNull: true, // نموونە: [{ min_qty: 10, price: 8000 }, { min_qty: 50, price: 7000 }]
    },

    // داشکاندنەکان (Discount Bundle)
    discount: {
      type: DataTypes.JSON,
      allowNull: true, // { is_active: true, type: "percent"|"fixed", value: 10, start_at: null, end_at: null }
    },

    // خزمەتگوزاری و مارکێتینگ (Marketing & Perks)
    is_free_delivery: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    cashback_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0, // بۆ نموونە: 5.00 واتا 5% کاشباک بۆ کڕیار
    },

    // کۆگا و ژمارەی کاڵا
    stock_quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    low_stock_alert: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
    },

    // میدیا و تایبەتمەندییەکان
    images: {
      type: DataTypes.JSON,
      allowNull: true, // لیستی وێنەکان: ["url1", "url2"]
    },
    extra_attributes: {
      type: DataTypes.JSON,
      allowNull: true, // بۆ هەر داتایەکی زیادە وەکو کێش، ماتریال، ڕەهەند بەبێ تێکدانی خشتەکە
    },

    // دۆخی کاڵا
    is_published: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: "products_v2",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["seller_id", "is_published"] },
      { fields: ["seller_id", "barcode"] },
      { fields: ["is_wholesale_only"] },
    ],
  },
);

export default ProductV2;
