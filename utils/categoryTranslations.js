const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cleanText = (value) =>
  typeof value === "string" ? value.replace(/&amp;/g, "&").trim() : "";

export function normalizeCategoryTranslations(value) {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, category]) => key && isPlainObject(category))
      .map(([key, category]) => {
        const subcategories = isPlainObject(category.subcategories)
          ? Object.fromEntries(
              Object.entries(category.subcategories)
                .filter(([subKey, subcategory]) =>
                  Boolean(subKey && isPlainObject(subcategory)),
                )
                .map(([subKey, subcategory]) => [
                  subKey,
                  {
                    ku: cleanText(subcategory.ku),
                    ar: cleanText(subcategory.ar),
                  },
                ]),
            )
          : {};

        return [
          key,
          {
            ku: cleanText(category.ku),
            ar: cleanText(category.ar),
            image: cleanText(category.image),
            subcategories,
          },
        ];
      }),
  );
}

export function getCategoryMap(seller) {
  return normalizeCategoryTranslations(seller?.category_translations);
}

export function getCategoryLabel(category, key, lang = "ku") {
  if (lang === "ar") return category?.ar || category?.ku || key;
  return category?.ku || category?.ar || key;
}

export function getSubcategoryLabel(subcategory, key, lang = "ku") {
  if (lang === "ar") return subcategory?.ar || subcategory?.ku || key;
  return subcategory?.ku || subcategory?.ar || key;
}
