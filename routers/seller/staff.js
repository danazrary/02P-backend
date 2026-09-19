// backend/routes/seller/staff.js
import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import Seller from "../../database/sellerv2.js";
import { staffToken, clearStaffCookie } from "../../utils/addingToken.js";
import { canManageStaff } from "../../middlewares/staffPermissions.js";
import { extractStaffArray, toPublicStaff } from "../../utils/staffHelpers.js";
import {
  getPermissionsForRole,
  getRoleMeta,
  isStaffRole,
  listStaffRoles,
} from "../../utils/staffRoles.js";

const router = express.Router();

// Compared against when the e-mail is unknown, so response time does not reveal
// which staff e-mails exist.
const DUMMY_HASH = bcrypt.hashSync("dwkanlink-dummy-password", 10);

const SERVER_ERROR = { success: false, message: "هەڵەی سێرڤەر ڕوویدا" };

// ==========================================
// 1) STAFF LOGIN  (POST /api/seller/staff/login)
//    Issues a STAFF token (own cookie + own secret, no role inside).
// ==========================================
router.post("/login", async (req, res) => {
  try {
    const { shop_name, email, password } = req.body;

    if (!shop_name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "تکایە هەموو خانەکان پڕبکەرەوە" });
    }

    const seller = await Seller.findOne({
      where: { shop_name: shop_name.trim().toLowerCase() },
    });

    if (!seller || seller.is_active === false) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشگا نەدۆزرایەوە یان ناچالاکە" });
    }

    const emailClean = email.trim().toLowerCase();
    const staffMember = extractStaffArray(seller).find(
      (stf) =>
        stf.email?.trim().toLowerCase() === emailClean &&
        stf.is_active !== false,
    );

    const match = await bcrypt.compare(
      password,
      staffMember?.password_hash || DUMMY_HASH,
    );

    if (!staffMember || !staffMember.password_hash || !match) {
      return res
        .status(401)
        .json({ success: false, message: "ئیمەیڵ یان وشەی نهێنی هەڵەیە" });
    }

    if (!isStaffRole(staffMember.role)) {
      return res.status(403).json({
        success: false,
        message: "ڕۆڵی ئەم هەژمارە دروست نییە، پەیوەندی بە خاوەنی فرۆشگا بکە",
      });
    }

    staffToken(staffMember, seller.id, res);

    return res.json({
      success: true,
      // kept for older frontend code
      isStaff: {
        role: staffMember.role,
        name: staffMember.name,
        staff_id: staffMember.staff_id,
      },
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
      role_meta: getRoleMeta(staffMember.role),
      permissions: getPermissionsForRole(staffMember.role),
    });
  } catch (err) {
    console.error("/api/seller/staff/login error:", err);
    return res.status(500).json(SERVER_ERROR);
  }
});

// ==========================================
// 2) STAFF LOGOUT  (POST /api/seller/staff/logout)
// ==========================================
router.post("/logout", (req, res) => {
  clearStaffCookie(res);
  return res.json({ success: true, message: "Logged out successfully" });
});

// ==========================================
// 3) AVAILABLE ROLES — feeds the role dropdown (owner only)
// ==========================================
router.get("/roles", canManageStaff, (req, res) => {
  return res.json({ success: true, roles: listStaffRoles() });
});

// ==========================================
// 4) LIST STAFF — owner only
// ==========================================
router.get("/list", canManageStaff, async (req, res) => {
  try {
    const seller = await Seller.findByPk(req.actor.sellerId);
    if (!seller) {
      return res
        .status(404)
        .json({ success: false, message: "فرۆشیار نەدۆزرایەوە" });
    }

    return res.json({
      success: true,
      staff_members: extractStaffArray(seller).map(toPublicStaff),
    });
  } catch (err) {
    console.error("Fetch Staff Error:", err);
    return res.status(500).json(SERVER_ERROR);
  }
});

// ==========================================
// 5) ADD STAFF — owner only
// ==========================================
router.post("/add", canManageStaff, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ success: false, message: "تکایە هەموو خانەکان پڕبکەرەوە" });
    }

    if (!isStaffRole(role)) {
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

    const seller = await Seller.findByPk(req.actor.sellerId);
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

    const newStaff = {
      staff_id: `stf_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      name: name.trim(),
      email: emailClean,
      password_hash: await bcrypt.hash(password, 10),
      role,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    staffList.push(newStaff);
    seller.staff_members = staffList;
    seller.changed("staff_members", true);
    await seller.save();

    return res.status(201).json({
      success: true,
      message: "کارمەند بە سەرکەوتوویی زیادکرا",
      staff: toPublicStaff(newStaff),
    });
  } catch (err) {
    console.error("Add Staff Error:", err);
    return res.status(500).json(SERVER_ERROR);
  }
});

// ==========================================
// 6) CHANGE STAFF ROLE — owner only
//    Takes effect on the staff member's very next request
//    (the role is read from the database, not from his token).
// ==========================================
router.put("/:staffId/role", canManageStaff, async (req, res) => {
  try {
    const { staffId } = req.params;
    const { role } = req.body;

    if (!isStaffRole(role)) {
      return res
        .status(400)
        .json({ success: false, message: "ڕۆڵی داواکراو نادروستە" });
    }

    const seller = await Seller.findByPk(req.actor.sellerId);
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
    return res.status(500).json(SERVER_ERROR);
  }
});

// ==========================================
// 7) DELETE STAFF — owner only
//    The deleted member is locked out on his next request.
// ==========================================
router.delete("/:staffId", canManageStaff, async (req, res) => {
  try {
    const { staffId } = req.params;

    const seller = await Seller.findByPk(req.actor.sellerId);
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
    return res.status(500).json(SERVER_ERROR);
  }
});

export default router;
