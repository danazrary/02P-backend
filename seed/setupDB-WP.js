import sequelize from "../database/sequelize.js"; // فایلە سەرەکییەکەی داتابەیسەکەت
import wProduct from "../database/wProducts.js"; // فایلی مۆدێلە نوێیەکە

const createTable = async () => {
  try {
    // دڵنیابوونەوە لە پەیوەندی داتابەیس
    await sequelize.authenticate();
    console.log("پەیوەندی داتابەیس سەرکەوتوو بوو.");

    // دروستکردنی خشتەکە
    // بەکارهێنانی { alter: true } وادەکات ئەگەر پێشتر هەبێت، تەنها گۆڕانکارییەکان زیاد بکات بەبێ سڕینەوەی داتاکان
    await wProduct.sync({ alter: true });

    console.log("خشتەی wProduct بە سەرکەوتوویی لە MySQL دروست کرا!");

    process.exit(); // داخستنی پڕۆسەکە دوای تەواوبوون
  } catch (error) {
    console.error("هەڵەیەک ڕوویدا لە کاتی دروستکردنی خشتەکە:", error);
  }
};

createTable();
