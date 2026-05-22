import { Router } from "express";
import { Op } from "sequelize";
import Order from "../../database/order.js";

const router = Router();

/**
 * POST /api/customer/orders/status-check
 *
 * Public endpoint — no auth required.
 * Accepts a list of order_id strings and returns their current statuses.
 * Used by the customer "My Orders" page to sync statuses stored in localStorage.
 *
 * Body: { orderIds: string[] }   max 30 IDs
 * Response: { statuses: { [order_id]: status } }
 */
router.post("/orders/status-check", async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "orderIds must be a non-empty array",
      });
    }

    // Clamp to 30 IDs to prevent abuse
    const ids = orderIds
      .slice(0, 30)
      .filter((id) => typeof id === "string" && /^ORD-[A-Za-z0-9]+$/.test(id));

    if (ids.length === 0) {
      return res.json({ success: true, statuses: {} });
    }

    const orders = await Order.findAll({
      where: { order_id: { [Op.in]: ids } },
      attributes: ["order_id", "status"],
    });

    const statuses = {};
    orders.forEach((o) => {
      statuses[o.order_id] = o.status;
    });

    return res.json({ success: true, statuses });
  } catch (err) {
    console.error("[customer/orders/status-check]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
