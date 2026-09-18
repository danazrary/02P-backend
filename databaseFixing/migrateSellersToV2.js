// migrateSellersToV2.js
import sequelize from "../database/sequelize.js";
import Seller from "../database/sellerv2.js"; // ناوی فایلەکە ڕاستکرایەوە

async function migrateSellers() {
  const transaction = await sequelize.transaction();
  try {
    console.log("🚀 دەستپێکردنی گواستنەوەی داتای Sellers...");

    const [oldSellers] = await sequelize.query("SELECT * FROM seller", {
      transaction,
    });
    console.log(`📦 ژمارەی فرۆشیارە دۆزراوەکان: ${oldSellers.length}`);

    for (const old of oldSellers) {
      const fallbackShopName = old.shop_name || `shop_${old.id}_${Date.now()}`;

      await Seller.upsert(
        {
          id: old.id,
          googleId: old.googleId || null,
          facebookId: old.facebookId || null,
          tiktokId: old.tiktokId || null,
          name: old.name || null,
          email: old.email || null,
          password_hash: old.password_hash || null,
          email_verified: Boolean(old.email_verified),
          verification_code: old.verification_code || null,
          code_expires: old.code_expires || null,
          needsManualEmail: Boolean(old.needsManualEmail),
          phone: old.phone || null,
          shop_name: fallbackShopName,
          shop_image: old.shop_image || null,
          bio: old.bio || null,
          business_type: "retail",
          store_visibility: "public",
          private_store_passcode: null,
          parent_wholesale_id: null,
          min_order_amount: 0,
          min_order_quantity: 1,
          city: old.shop_location
            ? String(old.shop_location).slice(0, 80)
            : null,
          shop_location: old.shop_location || null,
          social_links:
            typeof old.social_links === "string"
              ? JSON.parse(old.social_links)
              : old.social_links || {},
          categories:
            typeof old.categories === "string"
              ? JSON.parse(old.categories)
              : old.categories || [],
          subcategories_map:
            typeof old.subcategories_map === "string"
              ? JSON.parse(old.subcategories_map)
              : old.subcategories_map || {},
          category_translations:
            typeof old.category_translations === "string"
              ? JSON.parse(old.category_translations)
              : old.category_translations || {},
          category_images:
            typeof old.category_images === "string"
              ? JSON.parse(old.category_images)
              : old.category_images || {},
          brand_color: old.brand_color || null,
          red_line:
            typeof old.red_line === "string"
              ? JSON.parse(old.red_line)
              : old.red_line || null,
          red_lineAr:
            typeof old.red_lineAr === "string"
              ? JSON.parse(old.red_lineAr)
              : old.red_lineAr || null,
          ui_settings:
            typeof old.ui_settings === "string"
              ? JSON.parse(old.ui_settings)
              : old.ui_settings || null,
          default_shop_lang: old.default_shop_lang || "ku",
          order_type: old.order_type || "both",
          product_badges:
            typeof old.product_badges === "string"
              ? JSON.parse(old.product_badges)
              : old.product_badges || [],
          staff_members: [], // ستوونی نوێ بۆ کاشیر و کارمەندان
          ai_credits_balance: 0,
          is_active: true,
          terms_accepted_at: old.terms_accepted_at || null,
          deletion_requested_at: old.deletion_requested_at || null,
          createdAt: old.createdAt || new Date(),
          updatedAt: old.updatedAt || new Date(),
        },
        { transaction },
      );
    }

    await transaction.commit();
    console.log("✅ گواستنەوەی سەرجەم فرۆشیاران بە سەرکەوتوویی تەواو بوو.");
  } catch (error) {
    await transaction.rollback();
    console.error("❌ هەڵە لە گواستنەوەی فرۆشیاران:", error);
  } finally {
    await sequelize.close();
  }
}

migrateSellers();
