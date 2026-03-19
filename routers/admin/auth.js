import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { adminLimiter } from "../../utils/helper.js";
import Admin from "../../database/admin.js";
import AdminDevice from "../../database/adminDevice.js";
import { getDeviceHash } from "../../utils/device.js";
import { comparePassword } from "../../utils/helper.js";
const router = Router();
router.post("/login", adminLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ where: { email } });

    if (!admin || !admin.is_active) {
      return res
        .status(401)
        .json({ success: false, error: true, message: "Invalid credentials" });
    }

    // const isMatch = await bcrypt.compare(password, admin.password_hash);
    const isMatch = comparePassword(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: true,
        message: "Invalid credentialsddd",
      });
    }

    // 🔐 STEP 4 — DEVICE TRUST CHECK
    /*   const deviceHash = getDeviceHash(req);
    console.log(deviceHash);

    const trustedDevice = await AdminDevice.findOne({
      where: {
        admin_id: admin.id,
        device_hash: deviceHash,
        trusted: 1,
      },
    });

    console.log("trustedDevice:", trustedDevice);

    // If device NOT trusted
    if (!trustedDevice) {
  
      console.log("block", trustedDevice);

      // Check if this is the FIRST device
      const deviceCount = await AdminDevice.count({
        where: { admin_id: admin.id },
      });

      // First device → auto trust
      if (deviceCount === 0) {
        await AdminDevice.create({
          admin_id: admin.id,
          device_hash: deviceHash,
          user_agent: req.headers["user-agent"],
          ip_address: req.ip,
          last_used: new Date(),
          trusted: 1,
        });
      } else {
        console.log("block");

        // New device → BLOCK login
        return res.status(403).json({
          success: false,
          error: true,
          message: "New device detected. Login blocked.",
        });
      }
    } else {
      // Update last used time
      await trustedDevice.update({ last_used: new Date() });
    } */
    //FIX ME - For now, we will skip device trust check to unblock admin login. We can re-enable it later after testing.

    // Update last login
    await admin.update({ last_login: new Date() });

    // Create JWT
    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({
      success: true,
      error: false,
      message: "Admin login successful",
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res
      .status(500)
      .json({ success: false, error: true, message: "Server error" });
  }
});

export default router;
