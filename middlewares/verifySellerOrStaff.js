// backend/middlewares/verifySellerOrStaff.js
import jwt from "jsonwebtoken";
import SellerV2 from "../database/sellerv2.js";

/**
 * ڕێگەدان تەنها بە خاوەنی فرۆشگا (Owner) یان ستافی خاوەن دەسەڵات
 * ڕۆڵەکان: "manager", "warehouse", "cashier", "accountant"
 */
export function requireSellerOrStaff(
  allowedRoles = ["manager", "warehouse", "cashier"],
) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ success: false, error: true, message: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "dwkanlink_secret_key",
      );

      // ئەگەر فرۆشیاری سەرەکی بوو (Owner)
      if (decoded.role === "seller" || decoded.seller_id || decoded.id) {
        const sellerId = decoded.seller_id || decoded.id;
        const seller = await SellerV2.findByPk(sellerId);
        if (!seller || !seller.is_active) {
          return res
            .status(403)
            .json({
              success: false,
              error: true,
              message: "Seller inactive or not found",
            });
        }
        req.seller = seller;
        req.sellerId = seller.id;
        req.userRole = "owner";
        return next();
      }

      // ئەگەر کارمەند بوو (Staff)
      if (decoded.staff_id && decoded.parent_seller_id) {
        const seller = await SellerV2.findByPk(decoded.parent_seller_id);
        if (!seller) {
          return res
            .status(403)
            .json({ success: false, error: true, message: "Shop not found" });
        }

        const staffList = Array.isArray(seller.staff_members)
          ? seller.staff_members
          : [];
        const staffMember = staffList.find(
          (stf) => stf.staff_id === decoded.staff_id && stf.is_active,
        );

        if (!staffMember) {
          return res
            .status(403)
            .json({
              success: false,
              error: true,
              message: "Staff member not active or removed",
            });
        }

        // پشکنینی ڕۆڵ
        if (
          !allowedRoles.includes(staffMember.role) &&
          staffMember.role !== "manager"
        ) {
          return res.status(403).json({
            success: false,
            error: true,
            message: `Your role (${staffMember.role}) is not authorized to perform this action.`,
          });
        }

        req.seller = seller;
        req.sellerId = seller.id;
        req.staff = staffMember;
        req.userRole = staffMember.role;
        return next();
      }

      return res
        .status(403)
        .json({
          success: false,
          error: true,
          message: "Invalid authorization",
        });
    } catch (err) {
      console.error("Auth Middleware Error:", err);
      return res
        .status(401)
        .json({ success: false, error: true, message: "Unauthorized token" });
    }
  };
}
