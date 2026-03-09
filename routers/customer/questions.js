import { Router } from "express";
import Question from "../../database/questions.js";

const router = Router();

// Get all questions (public - no auth required)
router.get("/questions", async (req, res) => {
  try {
    const questions = await Question.findAll({
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      success: true,
      error: false,
      count: questions.length,
      data: questions,
    });
  } catch (err) {
    console.error("get-questions error:", err);
    return res.status(500).json({
      success: false,
      error: true,
      message: "Server error",
    });
  }
});

export default router;
