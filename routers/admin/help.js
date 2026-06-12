import { Router } from "express";
import { fn, col, Op } from "sequelize";
import {
  HelpAnalytics,
  HelpFeedback,
  HelpItem,
  HelpTranslation,
  sequelize,
} from "../../database/index.js";
import { adminAuth } from "../../middlewares/jwtVerify.js";

const router = Router();
const LANGUAGES = ["ku", "ar", "en"];
const FEEDBACK_TYPES = ["helpful", "not_helpful"];

function normalizeLanguage(language) {
  return LANGUAGES.includes(language) ? language : "ku";
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function wouldCreateParentCycle(itemId, parentId) {
  let currentParentId = parentId;
  const seen = new Set();

  while (currentParentId) {
    if (currentParentId === itemId || seen.has(currentParentId)) {
      return true;
    }

    seen.add(currentParentId);
    const parent = await HelpItem.findByPk(currentParentId, {
      attributes: ["id", "parent_id"],
    });

    if (!parent) return false;
    currentParentId = parent.parent_id;
  }

  return false;
}

router.get("/", adminAuth, async (req, res) => {
  try {
    const language = normalizeLanguage(req.query.language);
    const query = String(req.query.query || "").trim();
    const include = [
      {
        model: HelpTranslation,
        as: "translations",
        required: false,
      },
    ];

    if (query.length >= 2) {
      include[0].where = {
        [Op.or]: [
          { title: { [Op.like]: `%${query}%` } },
          { answer: { [Op.like]: `%${query}%` } },
        ],
      };
      include[0].required = true;
    }

    const items = await HelpItem.findAll({
      include,
      order: [
        ["parent_id", "ASC"],
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    res.json({
      success: true,
      language,
      data: items,
    });
  } catch (error) {
    console.error("admin help list error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load help items",
    });
  }
});

router.get("/analytics", adminAuth, async (req, res) => {
  try {
    const eventCounts = await HelpAnalytics.findAll({
      attributes: ["event_type", [fn("COUNT", col("id")), "count"]],
      group: ["event_type"],
      raw: true,
    });
    const feedbackCounts = await HelpFeedback.findAll({
      attributes: ["feedback_type", [fn("COUNT", col("id")), "count"]],
      group: ["feedback_type"],
      raw: true,
    });
    const topQuestionRows = await HelpAnalytics.findAll({
      where: { event_type: "question_open" },
      attributes: ["help_item_id", [fn("COUNT", col("id")), "opens"]],
      group: ["help_item_id"],
      order: [[fn("COUNT", col("id")), "DESC"]],
      limit: 10,
      raw: true,
    });
    const topQuestionIds = topQuestionRows
      .map((row) => row.help_item_id)
      .filter(Boolean);
    const topQuestionItems = topQuestionIds.length
      ? await HelpItem.findAll({
          where: { id: topQuestionIds },
          include: [
            {
              model: HelpTranslation,
              as: "translations",
              required: false,
            },
          ],
        })
      : [];
    const topQuestionById = new Map(
      topQuestionItems.map((item) => [item.id, item]),
    );
    const topQuestions = topQuestionRows.map((row) => ({
      help_item_id: row.help_item_id,
      opens: Number(row.opens || 0),
      item: topQuestionById.get(row.help_item_id) || null,
    }));

    res.json({
      success: true,
      data: {
        eventCounts,
        feedbackCounts,
        topQuestions,
      },
    });
  } catch (error) {
    console.error("admin help analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load help analytics",
    });
  }
});

router.post("/", adminAuth, async (req, res) => {
  try {
    const parentId = toNullableInteger(req.body.parent_id);

    if (parentId) {
      const parent = await HelpItem.findByPk(parentId, { attributes: ["id"] });
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: "Parent question not found",
        });
      }
    }

    const item = await HelpItem.create({
      parent_id: parentId,
      sort_order: Number.isInteger(Number(req.body.sort_order))
        ? Number(req.body.sort_order)
        : 0,
      is_published: req.body.is_published !== false,
    });

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("admin create help item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create help item",
    });
  }
});

router.post("/reorder", adminAuth, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (items.length === 0 || items.length > 500) {
    return res.status(400).json({
      success: false,
      message: "Items must be a non-empty array of up to 500 rows",
    });
  }

  const transaction = await sequelize.transaction();
  try {
    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id <= 0) continue;

      await HelpItem.update(
        {
          parent_id: toNullableInteger(item.parent_id),
          sort_order: Number.isInteger(Number(item.sort_order))
            ? Number(item.sort_order)
            : 0,
        },
        {
          where: { id },
          transaction,
        },
      );
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error("admin reorder help items error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reorder help items",
    });
  }
});

router.put("/:id", adminAuth, async (req, res) => {
  try {
    const item = await HelpItem.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Help item not found",
      });
    }

    const parentId = toNullableInteger(req.body.parent_id);
    if (parentId && (await wouldCreateParentCycle(item.id, parentId))) {
      return res.status(400).json({
        success: false,
        message: "This parent would create a question loop",
      });
    }

    await item.update({
      parent_id: parentId,
      sort_order: Number.isInteger(Number(req.body.sort_order))
        ? Number(req.body.sort_order)
        : item.sort_order,
      is_published:
        typeof req.body.is_published === "boolean"
          ? req.body.is_published
          : item.is_published,
    });

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("admin update help item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update help item",
    });
  }
});

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const deleted = await HelpItem.destroy({
      where: { id: req.params.id },
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Help item not found",
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("admin delete help item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete help item",
    });
  }
});

router.post("/translation", adminAuth, async (req, res) => {
  try {
    const helpItemId = Number(req.body.help_item_id);
    const language = normalizeLanguage(req.body.language);

    if (!Number.isInteger(helpItemId) || helpItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: "help_item_id is required",
      });
    }

    const item = await HelpItem.findByPk(helpItemId, { attributes: ["id"] });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Help item not found",
      });
    }

    const [translation, created] = await HelpTranslation.findOrCreate({
      where: {
        help_item_id: helpItemId,
        language,
      },
      defaults: {
        title: cleanString(req.body.title),
        answer: cleanString(req.body.answer, 100000),
      },
    });

    if (!created) {
      await translation.update({
        title: cleanString(req.body.title),
        answer: cleanString(req.body.answer, 100000),
      });
    }

    res.status(created ? 201 : 200).json({
      success: true,
      data: translation,
    });
  } catch (error) {
    console.error("admin create help translation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save help translation",
    });
  }
});

router.put("/translation/:id", adminAuth, async (req, res) => {
  try {
    const translation = await HelpTranslation.findByPk(req.params.id);
    if (!translation) {
      return res.status(404).json({
        success: false,
        message: "Translation not found",
      });
    }

    await translation.update({
      language: normalizeLanguage(req.body.language || translation.language),
      title: cleanString(req.body.title),
      answer: cleanString(req.body.answer, 100000),
    });

    res.json({
      success: true,
      data: translation,
    });
  } catch (error) {
    console.error("admin update help translation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update help translation",
    });
  }
});

export default router;
