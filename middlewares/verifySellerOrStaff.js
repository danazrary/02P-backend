// backend/middlewares/verifySellerOrStaff.js
//
// Legacy role-based guard, kept so existing routes keep working.
// The old version treated a staff token as the OWNER (it checked `decoded.seller_id`
// before the staff branch). This version relies on the unified identity layer:
//   - owner              -> always allowed
//   - staff "admin"      -> always allowed (was "manager")
//   - any other staff    -> allowed only when his role is in `allowedRoles`
//
// For new routes prefer permissions:  requirePermission("usePOS")

import Seller from "../database/sellerv2.js";
import { requireAuth } from "./jwtVerify.js";
import { attachActor } from "./staffPermissions.js";

export function requireSellerOrStaff(allowedRoles = ["cashier"]) {
  const guard = async (req, res, next) => {
    try {
      const actor = req.actor;

      if (
        actor.isStaff &&
        actor.role !== "admin" &&
        !allowedRoles.includes(actor.role)
      ) {
        return res.status(403).json({
          success: false,
          error: true,
          message: `Your role (${actor.role}) is not authorized to perform this action.`,
        });
      }

      const seller = await Seller.findByPk(actor.sellerId);
      if (!seller || !seller.is_active) {
        return res.status(403).json({
          success: false,
          error: true,
          message: "Seller inactive or not found",
        });
      }

      req.seller = seller;
      req.sellerId = seller.id;
      req.userRole = actor.isSeller ? "owner" : actor.role;
      if (actor.isStaff) {
        req.staff = {
          staff_id: actor.staffId,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        };
      }
      return next();
    } catch (err) {
      console.error("Auth Middleware Error:", err);
      return res
        .status(500)
        .json({ success: false, error: true, message: "Server error" });
    }
  };

  // Express flattens arrays, so this can be used as a normal middleware.
  return [requireAuth, attachActor, guard];
}
