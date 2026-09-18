import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

// دروستکردنی ژمارەی ٧-ڕەقەمی هەڕەمەکی بۆ کاڵای جوملە
const generate7DigitId = () => {
  return Math.floor(1000000 + Math.random() * 9000000);
};

const WProduct = sequelize.define(
  "WhProduct",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    retail_product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ئایدی کاڵا تاکەکە (لە خشتەی Product) بۆ هێنانەوەی وێنەکان",
    },
    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    language: {
      type: DataTypes.ENUM("arabic", "kurdish", "both"),
      defaultValue: "both",
    },
    title: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    description: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    features: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    videoLinks: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    priceType: {
      type: DataTypes.ENUM("USD", "IQD"),
      defaultValue: "USD",
    },
    wholesalePrices: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "نرخەکان بەپێی بڕ و جۆرەکان (Tiered Pricing)",
    },
    discount: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    freeDelivery: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    cashback: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    processing_time: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "wproducts",
    hooks: {
      beforeValidate: async (product) => {
        if (!product.id) {
          for (let attempt = 0; attempt < 100; attempt++) {
            const uniqueId = generate7DigitId();
            const existing = await WProduct.findByPk(uniqueId);
            if (!existing) {
              product.id = uniqueId;
              return;
            }
          }
          throw new Error(
            "Failed to generate unique 7-digit wholesale product ID",
          );
        }
      },
    },
  },
);

export default WProduct;

/* 
=============================================================================
  ڕێبەری هەڵگرتنی داتاکان لەناو JSON کۆڵۆمەکان (Documentation)
=============================================================================

1. title, description:
{
  "ku": "دەقی کوردی",
  "ar": "النص العربي"
}

2. features (تایبەتمەندییەکان - وەک ئارەیەک هەڵدەگیرێت):
{
  "ku": ["دژە ئاو", "گەرەنتی ١ ساڵ"],
  "ar": ["مضاد للماء", "ضمان سنة واحدة"]
}

3. wholesalePrices (گرنگترین بەش - نرخ و جۆرەکان):
[
  {
    "choices": { "ku": "رەنگی رەش و سپی", "ar": "أسود وأبيض" },
    "unitType": "carton",
    "tiers": [
      { "minQty": 10, "maxQty": 50, "price": 10 },
      { "minQty": 51, "maxQty": null, "price": 9 } 
    ]
  }
]

4. discount (داشکاندن - هەمیشە بە ڕێژەی سەدییە %):
{
  "isActive": true,
  "startDate": "2026-10-01",
  "endDate": "2026-11-01",
  "isForever": false,
  "minQty": 10,
  "unitType": "carton",
  "value": 15  // واتە 15% داشکاندن
}

5. freeDelivery (گەیاندن):
{
  "isActive": true,
  "startDate": "2026-10-01",
  "endDate": null,
  "isForever": true,
  "minQty": 5,
  "unitType": "set",
  "discountPercent": 100 // 100 واتە گەیاندنی خۆڕایی، 50 واتە نیوەی پارەی گەیاندن
}

6. cashback (گەڕانەوەی پارە - جۆری دراو هی کاڵاکەیە):
{
  "isActive": true,
  "startDate": "2026-09-01",
  "endDate": null,
  "isForever": true,
  "minQty": 100,
  "unitType": "piece",
  "amount": 25 // 25 دۆلار یان دینار بەپێی priceType
}
=============================================================================
*/
