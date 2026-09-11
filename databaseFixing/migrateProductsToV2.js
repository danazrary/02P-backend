// migrateProductsToV2.js
import sequelize from "../database/sequelize.js";
import ProductV2 from "../database/productv2.js";

async function migrateProducts() {
  const transaction = await sequelize.transaction();
  try {
    console.log("🚀 دەستپێکردنی گواستنەوەی داتای Products...");

    const [oldProducts] = await sequelize
      .query("SELECT * FROM products", { transaction })
      .catch(async () => {
        return await sequelize.query("SELECT * FROM product", { transaction });
      });

    console.log(`📦 ژمارەی کاڵا دۆزراوەکان: ${oldProducts.length}`);

    for (const old of oldProducts) {
      // ١. تێکەڵکردنی زمانەکان بۆ ناو JSON
      const titleJson = {
        ku: old.titleKu || old.titleKr || old.name || old.title || "",
        ar: old.titleAr || "",
        en: old.titleEn || "",
      };

      const descJson = {
        ku: old.descriptionKu || old.descriptionKr || old.description || "",
        ar: old.descriptionAr || "",
        en: old.descriptionEn || "",
      };

      // ٢. کۆکردنەوەی داشکاندنەکان لە یەک JSON
      const hasDiscount = Boolean(
        old.discount_percent > 0 ||
        old.discountType ||
        old.discountPrice ||
        old.hasDiscount,
      );
      const discountJson = hasDiscount
        ? {
            is_active: true,
            type: old.discountType || "percentage",
            value: old.discount_percent || 0,
            start_at: old.discountStartDate || null,
            end_at: old.discountEndDate || null,
          }
        : null;

      // ٣. چارەسەرکردنی وێنەکان
      let parsedImages = [];
      if (typeof old.images === "string") {
        try {
          parsedImages = JSON.parse(old.images);
        } catch {
          parsedImages = [old.images];
        }
      } else if (Array.isArray(old.images)) {
        parsedImages = old.images;
      }

      await ProductV2.upsert(
        {
          id: old.id,
          seller_id: old.seller_id,
          title: titleJson,
          description: descJson,
          barcode: old.barcode || null,
          sku: old.sku || null,
          cost_price: old.cost_price || 0.0,
          retail_price: old.realPrice || old.price || 0.0,
          is_wholesale_only: false,
          wholesale_price: null,
          min_wholesale_quantity: 1,
          wholesale_tier_pricing: null,
          discount: discountJson,
          is_free_delivery: Boolean(old.free_delivery || false),
          cashback_percent: old.hasCashback ? old.cashbackValue || 0.0 : 0.0,
          stock_quantity: old.stock || 0,
          low_stock_alert: 5,
          images: parsedImages,
          extra_attributes: null,
          is_published:
            old.isAvailable !== undefined ? Boolean(old.isAvailable) : true,
          sort_order: 0,
          createdAt: old.createdAt || new Date(),
          updatedAt: old.updatedAt || new Date(),
        },
        { transaction },
      );
    }

    await transaction.commit();
    console.log("✅ گواستنەوەی سەرجەم کاڵاکان بە سەرکەوتوویی تەواو بوو.");
  } catch (error) {
    await transaction.rollback();
    console.error("❌ هەڵە لە گواستنەوەی کاڵاکان:", error);
  } finally {
    await sequelize.close();
  }
}

migrateProducts();
