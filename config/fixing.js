import Seller from "../database/seller.js";

const sellers = await Seller.findAll();

for (const seller of sellers) {
  const categories = seller.categories || [];
  const subMap = seller.subcategories_map || {};
  const images = seller.category_images || {};

  const categoryTranslations = {};

  for (const cat of categories) {
    categoryTranslations[cat] = {
      ku: cat,
      ar: "",
      image: images[cat] || null,
      subcategories: {},
    };

    const subs = subMap[cat] || [];

    for (const sub of subs) {
      categoryTranslations[cat].subcategories[sub] = {
        ku: sub,
        ar: "",
      };
    }
  }

  await seller.update({
    category_translations: categoryTranslations,
  });
}

console.log("Category migration completed");
process.exit();
