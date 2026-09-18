// sellerv2.js
import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const Seller = sequelize.define(
  "Seller",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    // --- ئەکاونت و دەروازەکانی چوونەژوورەوە (OAuth & Credentials) ---
    googleId: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: true,
    },
    facebookId: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: true,
    },
    tiktokId: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: true,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verification_code: {
      type: DataTypes.STRING(32),
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
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    // --- ناسنامەی فرۆشگا و بەستەری URL ---
    shop_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true, // لینکی فرۆشگا: dwkanlink.com/store/shop_name
    },
    shop_image: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    // --- ڕۆڵی بازرگانی و کۆنتڕۆڵی دەستڕاگەیشتن ---
    business_type: {
      type: DataTypes.ENUM(
        "wholesale",
        "retail",
        "social_media",
        "representative",
      ),
      allowNull: false,
      defaultValue: "retail",
    },
    store_visibility: {
      type: DataTypes.ENUM("public", "private"),
      defaultValue: "public",
    },
    private_store_passcode: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    parent_wholesale_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    min_order_amount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    min_order_quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 1,
    },

    // --- بەڕێوەبردنی ستاف، کاشیر و دەسەڵاتەکان ---
    staff_members: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      /*
        شێوازی داتا لەناو ئەم ستوونە:
        [
          {
            "staff_id": "stf_49201",
            "name": "کارمەند ١",
            "email": "cashier@dwkan.com",
            "password_hash": "$2b$10$encryptedHash...",
            "role": "cashier", // cashier | warehouse | manager | accountant
            "is_active": true,
            "created_at": "2026-09-06T15:00:00Z"
          }
        ]
      */
    },

    // --- لۆکەیشن و ناونیشان ---
    city: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    shop_location: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    // --- بەستەری سۆشیاڵ میدیا ---
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

    // --- کاتیگۆری، باج و دیزاین ---
    categories: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    subcategories_map: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    category_translations: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    category_images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    // لەناو مۆدێلی Seller لە فایلی sellerv2.js
    brand_color: {
      type: DataTypes.JSON, // 👈 گۆڕدرا بۆ JSON تا هەرسێ ڕەنگەکە بگرێتە خۆ
      allowNull: true,
      defaultValue: {
        primary: "#5d5fef",
        bg: "#ffffff",
        text: "#0b0b0f",
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
    product_badges: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },

    // --- ڕێکخستنی سیستەم و فرۆشتن ---
    ui_settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    default_shop_lang: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "ku",
    },
    order_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "both",
    },

    // --- کرێدیتی AI و دۆخی هەژمار ---
    ai_credits_balance: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    terms_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    deletion_requested_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "sellers_v2",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { unique: true, fields: ["shop_name"] },
      { unique: true, fields: ["email"] },
      { fields: ["business_type", "store_visibility"] },
      { fields: ["parent_wholesale_id"] },
    ],
  },
);

export default Seller;
