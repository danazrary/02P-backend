import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import SellerV2 from "../../database/sellerv2.js";
import { checkMe } from "../../middlewares/jwtVerify.js";

const router = express.Router();

const ALLOWED_STAFF_ROLES = [
  "admin",
  "product_manager",
  "shop_editor",
  "cashier",
];

function extractStaffArray(seller) {
  if (!seller || !seller.staff_members) return [];
  if (Array.isArray(seller.staff_members)) return [...seller.staff_members];
  if (typeof seller.staff_members === "string") {
    try {
      return JSON.parse(seller.staff_members);
    } catch {
      return [];
    }
  }
  return [];
}

// ==========================================
// ١) چوونەژوورەوەی ستاف (POST /api/seller/staff/login)
// ==========================================
router.post("/login", async (req, res) => {
  try {
    const { shop_name, email, password } = req.body;

    if (!shop_name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "تکایە هەموو خانەکان پڕبکەرەوە" });
    }

    const seller = await SellerV2.findOne({
      where: { shop_name: shop_name.trim().toLowerCase() },
    });

    if (!seller || seller.is_active === false) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشگا نەدۆزرایەوە یان ناچالاکە" });
    }

    const staffList = extractStaffArray(seller);

    const staffMember = staffList.find(
      (stf) =>
        stf.email?.trim().toLowerCase() === email.trim().toLowerCase() &&
        stf.is_active !== false,
    );

    if (!staffMember || !staffMember.password_hash) {
      return res
        .status(401)
        .json({ success: false, message: "ئیمەیڵ یان وشەی نهێنی هەڵەیە" });
    }

    const match = await bcrypt.compare(password, staffMember.password_hash);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "ئیمەیڵ یان وشەی نهێنی هەڵەیە" });
    }

    const payload = {
      role: "staff",
      staff_role: staffMember.role || "cashier",
      staff_id: staffMember.staff_id,
      staff_name: staffMember.name,
      email: staffMember.email,
      seller_id: seller.id,
      parent_seller_id: seller.id,
      shop_name: seller.shop_name,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "dwkanlink_secret_key",
      { expiresIn: "30d" },
    );

    return res.json({
      success: true,
      token,
      staff: {
        staff_id: staffMember.staff_id,
        name: staffMember.name,
        email: staffMember.email,
        role: staffMember.role,
      },
      shop: {
        id: seller.id,
        shop_name: seller.shop_name,
        business_type: seller.business_type,
      },
    });
  } catch (err) {
    console.error("/api/seller/staff/login error:", err);
    return res
      .status(500)
      .json({ success: false, message: "هەڵەی سێرڤەر ڕوویدا" });
  }
});

// ==========================================
// ٢) هێنانی لیستی کارمەندەکان
// ==========================================
router.get("/list", checkMe, async (req, res) => {
  try {
    const sellerId = req.user?.data?.id || req.user?.id;
    const seller = await SellerV2.findByPk(sellerId);

    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشیار نەدۆزرایەوە" });
    }

    const staffList = extractStaffArray(seller);
    const safeStaffList = staffList.map(({ password_hash, ...rest }) => rest);

    return res.json({ success: true, staff_members: safeStaffList });
  } catch (err) {
    console.error("Fetch Staff Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "هەڵەی سێرڤەر ڕوویدا" });
  }
});

// ==========================================
// ٣) زیادکردنی کارمەند
// ==========================================
router.post("/add", checkMe, async (req, res) => {
  try {
    const sellerId = req.user?.data?.id || req.user?.id;
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: "تکایە هەموو خانەکان پڕبکەرەوە" });
    }

    if (!ALLOWED_STAFF_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: "ڕۆڵی دیاریکراو نادروستە" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "پاسۆرد دەبێت لانیکەم ٦ پیت یان ژمارە بێت",
      });
    }

    const seller = await SellerV2.findByPk(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشیار نەدۆزرایەوە" });
    }

    const staffList = extractStaffArray(seller);
    const emailClean = email.trim().toLowerCase();

    if (staffList.some((s) => s.email?.toLowerCase() === emailClean)) {
      return res
        .status(400)
        .json({ success: false, message: "ئەم ئیمەیڵە پێشتر تۆمارکراوە" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newStaff = {
      staff_id: `stf_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      name: name.trim(),
      email: emailClean,
      password_hash,
      role,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    staffList.push(newStaff);

    seller.staff_members = staffList;
    seller.changed("staff_members", true);
    await seller.save();

    const { password_hash: _, ...safeData } = newStaff;
    return res.status(201).json({
      success: true,
      message: "کارمەند بە سەرکەوتوویی زیادکرا",
      staff: safeData,
    });
  } catch (err) {
    console.error("Add Staff Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "هەڵەی سێرڤەر ڕوویدا" });
  }
});

// ==========================================
// ٤) گۆڕینی ڕۆڵی کارمەند
// ==========================================
router.put("/:staffId/role", checkMe, async (req, res) => {
  try {
    const sellerId = req.user?.data?.id || req.user?.id;
    const { staffId } = req.params;
    const { role } = req.body;

    if (!ALLOWED_STAFF_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ success: false, message: "ڕۆڵی داواکراو نادروستە" });
    }

    const seller = await SellerV2.findByPk(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشیار نەدۆزرایەوە" });
    }

    const staffList = extractStaffArray(seller);
    const staffIndex = staffList.findIndex((s) => s.staff_id === staffId);

    if (staffIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "کارمەند نەدۆزرایەوە" });
    }

    staffList[staffIndex].role = role;
    staffList[staffIndex].updated_at = new Date().toISOString();

    seller.staff_members = staffList;
    seller.changed("staff_members", true);
    await seller.save();

    return res.json({
      success: true,
      message: "ڕۆڵی کارمەند بە سەرکەوتوویی نوێکرایەوە",
    });
  } catch (err) {
    console.error("Update Staff Role Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "هەڵەی سێرڤەر ڕوویدا" });
  }
});

// ==========================================
// ٥) سڕینەوەی کارمەند
// ==========================================
router.delete("/:staffId", checkMe, async (req, res) => {
  try {
    const sellerId = req.user?.data?.id || req.user?.id;
    const { staffId } = req.params;

    const seller = await SellerV2.findByPk(sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشیار نەدۆزرایەوە" });
    }

    const staffList = extractStaffArray(seller);
    const filtered = staffList.filter((s) => s.staff_id !== staffId);

    if (filtered.length === staffList.length) {
      return res
        .status(404)
        .json({ success: false, message: "کارمەند نەدۆزرایەوە" });
    }

    seller.staff_members = filtered;
    seller.changed("staff_members", true);
    await seller.save();

    return res.json({
      success: true,
      message: "کارمەند بە سەرکەوتوویی سڕایەوە",
    });
  } catch (err) {
    console.error("Delete Staff Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "هەڵەی سێرڤەر ڕوویدا" });
  }
});

export default router;
