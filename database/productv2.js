import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const ProductV2 = sequelize.define(
  "ProductV2",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: false, // ID بە دەستی دادەنرێت (ڕەقەمی ٦ ژمارەیی هەڕەمەکی)
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
    // خانەی تایبەتی کاڵا — لیستێک، هەر دانەیەک هاوکات ناو/بەهای
    // کوردی و عەرەبی پێکەوە دەگرێت:
    // [{ ku: {name, value}, ar: {name, value} }, ...]
    custom_inputs: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // زمانی سەرەکی داخڵکردنی کاڵاکە، بۆ هەڵبژاردنی ناونیشان/نرخ کاتێک
    // تەنها یەک زمان پڕکراوەتەوە
    language: {
      type: DataTypes.ENUM("kurdish", "arabic", "both"),
      allowNull: false,
      defaultValue: "both",
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
    // دراوی نرخەکان (retail_price / wholesale_price / cost_price)
    price_type: {
      type: DataTypes.ENUM("iqd", "usd"),
      allowNull: false,
      defaultValue: "iqd",
    },

    // ڤاریانتی تاک فرۆشی (Retail Variants) — بژاردەکان (ڕەنگ، قەبارە...)
    // لەگەڵ نرخی جیاوازی هەریەکەیان، بە زمانی کوردی و عەرەبی
    // نموونە: [{ colors: "سوور", size: "M", price: 15000, stock: 20 }]
    variant_r: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    variant_r_ar: {
      type: DataTypes.JSON,
      allowNull: true,
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
    // ڤاریانتی جوملە (Wholesale Variants) — هەر دانەیەک هێڵێکی خۆسەربەخۆیە،
    // وەسفی دەقی ئازاد بۆ ناوەڕۆکی بەستە + مەودای بڕ و نرخ
    // نموونە: [{ options_description: "ڕەنگ سوور، ڕەش، سپی، قەبارە
    //   sm,md,lg", min_order: 7, max_order: 48, type: "carton", price: 35 }]
    variant_w: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // کاتیگۆری و ژێرکاتیگۆری — ستوونی ڕاستەوخۆ بۆ فلتەرکردنی خێرا
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    subcategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // داشکاندنەکان (Discount Bundle)
    // { is_active: true, mode: "running"|"timer", type: "percent"|"fixed",
    //   value: 10, start_at: null, end_at: null }
    // mode "running" = چالاکە تا خۆت بیوەستێنیت (بێ کاتژمێر)
    // mode "timer"   = کاتژمێری دیاریکراو هەیە (end_at پێویستە)
    discount: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // کاشباک (Cashback Bundle)
    // { is_active: true, mode: "running"|"timer", value_type: "percent"|"fixed",
    //   value: 5, currency: "USD"|"IQD", start_at: null, end_at: null }
    cashback: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // گەیاندنی بەخۆڕایی (Free Delivery Bundle)
    // { is_active: true, mode: "running"|"timer", start_at: null, end_at: null }
    free_delivery: {
      type: DataTypes.JSON,
      allowNull: true,
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
    // بەستەری ڤیدیۆ (یوتیوب/تیک‌تۆک)، وەک لیستی دەق
    video_links: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    extra_attributes: {
      type: DataTypes.JSON,
      allowNull: true, // بۆ هەر داتایەکی زیادە وەکو کێش، ماتریال، ڕەهەند بەبێ تێکدانی خشتەکە
    },

    // ژمارەی سەردانی لاپەڕەی کاڵا (View Counter)
    views: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
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
      { fields: ["seller_id", "category"] },
      { fields: ["seller_id", "category", "subcategory"] },
    ],
  },
);

export default ProductV2;
