import express from "express";
import jwt from "jsonwebtoken";

// Simple in-memory users for demo
const users = [];

const router = express.Router();

// ----- REGISTER -----
router.post("/register", (req, res) => {
  const { name, email, number } = req.body;

  if (!name || !email || !number) {
    return res
      .status(400)
      .json({ message: "Name, email, and number are required" });
  }

  // Check if user already exists
  const existingUser = users.find((u) => u.email === email);
  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }

  // Create new user
  const newUser = { id: users.length + 1, name, email, number };
  users.push(newUser);

  // Generate JWT
  const token = jwt.sign(
    {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ message: "User registered", token });
});

// ----- LOGIN -----
router.post("/login", (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ message: "User not found" });

  // Generate JWT
  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ message: "Login successful", token });
});

export default router;
