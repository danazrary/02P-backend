import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { jwtVerifySellerToken } from "../../middlewares/jwtVerify.js";
import { r2Multer, uploadToR2, deleteFromR2 } from "../../utils/r2.js";
import {
  decrementSellerStorage,
  incrementSellerStorage,
} from "../../middlewares/checkStorageLimit.js";
import Seller from "../../database/seller.js";
import Product from "../../database/products.js";
import { getStoredAssetBytes } from "../../utils/sellerStorageUsage.js";
import { getCategoryMap } from "../../utils/categoryTranslations.js";

const router = Router();
const catImageUpload = r2Multer.single("image");

const cleanText = (value) =>
  typeof value === "string" ? value.replace(/&amp;/g, "&").trim() : "";

function makeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findKey(map, requestedKey) {
  const decoded = decodeURIComponent(requestedKey || "");
  return Object.keys(map).find(
    (key) => key.toLocaleLowerCase() === decoded.toLocaleLowerCase(),
  );
}

function categoryPayload(categoryTranslations) {
  return { category_translations: categoryTranslations };
}

async function findSeller(id) {
  return Seller.findByPk(id, { attributes: ["id", "category_translations"] });
}

router.get("/categories", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(getCategoryMap(seller)),
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.get("/categories-full", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(getCategoryMap(seller)),
    });
  } catch (error) {
    console.error("Error fetching categories-full:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.post("/categories", jwtVerifySellerToken, async (req, res) => {
  try {
    const source =
      req.body?.category && typeof req.body.category === "object"
        ? req.body.category
        : req.body || {};
    const ku = cleanText(source.ku || (typeof req.body?.category === "string" ? req.body.category : ""));
    const ar = cleanText(source.ar);
    const requestedKey = cleanText(source.key || source.categoryKey);

    if (!ku && !ar) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "A Kurdish or Arabic category name is required",
      });
    }

    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }

    const map = getCategoryMap(seller);
    const key = makeKey(requestedKey || ku || ar);
    if (!key) {
      return res.status(400).json({ success: false, error: true, message: "Invalid category key" });
    }
    if (findKey(map, key)) {
      return res.status(400).json({ success: false, error: true, message: "Category already exists" });
    }

    map[key] = { ku, ar, image: "", subcategories: {} };
    await seller.update({ category_translations: map });
    return res.status(201).json({
      success: true,
      error: false,
      key,
      ...categoryPayload(map),
      message: "Category added successfully",
    });
  } catch (error) {
    console.error("Error adding category:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.put("/categories/:categoryKey", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }

    const map = getCategoryMap(seller);
    const key = findKey(map, req.params.categoryKey);
    if (!key) {
      return res.status(404).json({ success: false, error: true, message: "Category not found" });
    }

    const ku = cleanText(req.body?.ku ?? req.body?.newName ?? map[key].ku);
    const ar = cleanText(req.body?.ar ?? map[key].ar);
    if (!ku && !ar) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "A Kurdish or Arabic category name is required",
      });
    }

    map[key] = { ...map[key], ku, ar };
    await seller.update({ category_translations: map });
    return res.status(200).json({
      success: true,
      error: false,
      key,
      ...categoryPayload(map),
      message: "Category updated successfully",
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.delete("/categories/:categoryKey", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }

    const map = getCategoryMap(seller);
    const key = findKey(map, req.params.categoryKey);
    if (!key) {
      return res.status(404).json({ success: false, error: true, message: "Category not found" });
    }

    const productsCount = await Product.count({
      where: { seller_id: req.user.id, category: key },
    });
    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Cannot delete category. There are products using this category.",
        productsCount,
      });
    }

    const image = map[key].image;
    if (image) {
      const bytes = await getStoredAssetBytes(image);
      await deleteFromR2(image).catch(() => {});
      if (bytes > 0) await decrementSellerStorage(req.user.id, bytes);
    }
    delete map[key];
    await seller.update({ category_translations: map });
    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(map),
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.post("/subcategories", jwtVerifySellerToken, async (req, res) => {
  try {
    const categoryKey = cleanText(req.body?.categoryKey || req.body?.category);
    const source =
      req.body?.subcategory && typeof req.body.subcategory === "object"
        ? req.body.subcategory
        : req.body || {};
    const ku = cleanText(source.ku || (typeof req.body?.subcategory === "string" ? req.body.subcategory : ""));
    const ar = cleanText(source.ar);
    const requestedSubKey = cleanText(source.key || source.subcategoryKey);
    if (!categoryKey || (!ku && !ar)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: "Category key and a Kurdish or Arabic subcategory name are required",
      });
    }

    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    const map = getCategoryMap(seller);
    const key = findKey(map, categoryKey);
    if (!key) {
      return res.status(404).json({ success: false, error: true, message: "Parent category not found" });
    }

    const subKey = makeKey(requestedSubKey || ku || ar);
    const subcategories = map[key].subcategories;
    if (!subKey || findKey(subcategories, subKey)) {
      return res.status(400).json({ success: false, error: true, message: "Subcategory already exists or has an invalid key" });
    }

    subcategories[subKey] = { ku, ar };
    await seller.update({ category_translations: map });
    return res.status(201).json({
      success: true,
      error: false,
      key: subKey,
      ...categoryPayload(map),
      message: "Subcategory added successfully",
    });
  } catch (error) {
    console.error("Error adding subcategory:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.put("/subcategories/:categoryKey/:subcategoryKey", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    const map = getCategoryMap(seller);
    const categoryKey = findKey(map, req.params.categoryKey);
    const subcategoryKey = categoryKey
      ? findKey(map[categoryKey].subcategories, req.params.subcategoryKey)
      : null;
    if (!categoryKey || !subcategoryKey) {
      return res.status(404).json({ success: false, error: true, message: "Subcategory not found" });
    }

    const current = map[categoryKey].subcategories[subcategoryKey];
    const ku = cleanText(req.body?.ku ?? current.ku);
    const ar = cleanText(req.body?.ar ?? current.ar);
    if (!ku && !ar) {
      return res.status(400).json({ success: false, error: true, message: "A Kurdish or Arabic subcategory name is required" });
    }
    map[categoryKey].subcategories[subcategoryKey] = { ku, ar };
    await seller.update({ category_translations: map });
    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(map),
      message: "Subcategory updated successfully",
    });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.delete("/subcategories", jwtVerifySellerToken, async (req, res) => {
  try {
    const requestedCategory = cleanText(req.body?.categoryKey || req.body?.category);
    const requestedSubcategory = cleanText(req.body?.subcategoryKey || req.body?.subcategory);
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    const map = getCategoryMap(seller);
    const categoryKey = findKey(map, requestedCategory);
    const subcategoryKey = categoryKey
      ? findKey(map[categoryKey].subcategories, requestedSubcategory)
      : null;
    if (!categoryKey || !subcategoryKey) {
      return res.status(404).json({ success: false, error: true, message: "Subcategory not found" });
    }

    delete map[categoryKey].subcategories[subcategoryKey];
    await seller.update({ category_translations: map });
    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(map),
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

router.put(
  "/categories/:categoryKey/image",
  jwtVerifySellerToken,
  (req, res, next) => {
    catImageUpload(req, res, (error) => {
      if (error) return res.status(400).json({ success: false, error: true, message: error.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: true, message: "No image file provided" });
      }
      const seller = await findSeller(req.user.id);
      if (!seller) {
        return res.status(404).json({ success: false, error: true, message: "Seller not found" });
      }
      const map = getCategoryMap(seller);
      const key = findKey(map, req.params.categoryKey);
      if (!key) {
        return res.status(404).json({ success: false, error: true, message: "Category not found" });
      }

      const oldImage = map[key].image;
      if (oldImage) {
        const bytes = await getStoredAssetBytes(oldImage);
        await deleteFromR2(oldImage).catch(() => {});
        if (bytes > 0) await decrementSellerStorage(req.user.id, bytes);
      }

      const image = `shops/${req.user.id}/categories/${uuidv4()}.webp`;
      const { sizeBytes } = await uploadToR2(req.file.buffer, image);
      map[key].image = image;
      await seller.update({ category_translations: map });
      if (sizeBytes > 0) await incrementSellerStorage(req.user.id, sizeBytes);

      return res.status(200).json({
        success: true,
        error: false,
        ...categoryPayload(map),
        message: "Category image updated",
      });
    } catch (error) {
      console.error("Error uploading category image:", error);
      return res.status(500).json({ success: false, error: true, message: error.message || "Server error" });
    }
  },
);

router.delete("/categories/:categoryKey/image", jwtVerifySellerToken, async (req, res) => {
  try {
    const seller = await findSeller(req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, error: true, message: "Seller not found" });
    }
    const map = getCategoryMap(seller);
    const key = findKey(map, req.params.categoryKey);
    if (!key) {
      return res.status(404).json({ success: false, error: true, message: "Category not found" });
    }

    const image = map[key].image;
    if (image) {
      const bytes = await getStoredAssetBytes(image);
      await deleteFromR2(image).catch(() => {});
      map[key].image = "";
      await seller.update({ category_translations: map });
      if (bytes > 0) await decrementSellerStorage(req.user.id, bytes);
    }

    return res.status(200).json({
      success: true,
      error: false,
      ...categoryPayload(map),
      message: "Category image removed",
    });
  } catch (error) {
    console.error("Error deleting category image:", error);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});

export default router;
