import { Router } from "express";
import { Op } from "sequelize";
import {
  HelpAnalytics,
  HelpFeedback,
  HelpItem,
  HelpTranslation,
} from "../database/index.js";
import { detectSeller } from "../middlewares/jwtVerify.js";

const router = Router();
const LANGUAGES = ["ku", "ar", "en"];

function normalizeLanguage(language) {
  return LANGUAGES.includes(language) ? language : "ku";
}

function getSellerId(req) {
  return req.seller?.id || req.user?.id || null;
}

function hasTranslationContent(translation) {
  return Boolean(
    String(translation?.title || "").trim() ||
      String(translation?.answer || "").trim(),
  );
}

function pickTranslation(translations = [], language = "ku") {
  const orderedLanguages = [
    language,
    "ku",
    "ar",
    "en",
  ].filter((value, index, array) => array.indexOf(value) === index);

  for (const languageCode of orderedLanguages) {
    const translation = translations.find(
      (item) => item.language === languageCode && hasTranslationContent(item),
    );
    if (translation) return translation;
  }

  return translations.find(hasTranslationContent) || null;
}

function serializeItem(item, language) {
  const json = item.toJSON ? item.toJSON() : item;
  const translation = pickTranslation(json.translations || [], language);

  return {
    id: json.id,
    parent_id: json.parent_id,
    sort_order: json.sort_order,
    is_published: json.is_published,
    title: translation?.title || "",
    answer: translation?.answer || "",
    language: translation?.language || language,
    translations: json.translations || [],
    children: [],
    created_at: json.created_at,
    updated_at: json.updated_at,
  };
}

function buildTree(items, language) {
  const serialized = items
    .map((item) => serializeItem(item, language))
    .filter((item) => item.title || item.answer);
  const byId = new Map(serialized.map((item) => [item.id, item]));
  const roots = [];

  for (const item of serialized) {
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id).children.push(item);
    } else {
      roots.push(item);
    }
  }

  const sortRecursive = (nodes) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    nodes.forEach((node) => sortRecursive(node.children));
  };
  sortRecursive(roots);

  return roots;
}

async function trackEvent({ help_item_id = null, seller_id = null, event_type, metadata = null }) {
  try {
    await HelpAnalytics.create({
      help_item_id,
      seller_id,
      event_type,
      metadata,
    });
  } catch (error) {
    console.error("help analytics error:", error);
  }
}

router.get("/tree", detectSeller, async (req, res) => {
  try {
    const language = normalizeLanguage(req.query.language);
    const items = await HelpItem.findAll({
      where: { is_published: true },
      include: [
        {
          model: HelpTranslation,
          as: "translations",
          required: false,
        },
      ],
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    res.json({
      success: true,
      data: buildTree(items, language),
    });
  } catch (error) {
    console.error("help tree error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load help center",
    });
  }
});

router.get("/search", detectSeller, async (req, res) => {
  try {
    const language = normalizeLanguage(req.query.language);
    const query = String(req.query.query || "").trim();

    if (query.length < 2) {
      return res.json({ success: true, data: [] });
    }

    await trackEvent({
      seller_id: getSellerId(req),
      event_type: "search",
      metadata: { query, language },
    });

    const items = await HelpItem.findAll({
      where: { is_published: true },
      include: [
        {
          model: HelpTranslation,
          as: "translations",
          required: true,
          where: {
            [Op.or]: [
              { title: { [Op.like]: `%${query}%` } },
              { answer: { [Op.like]: `%${query}%` } },
            ],
          },
        },
      ],
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
      limit: 25,
    });

    res.json({
      success: true,
      data: items.map((item) => serializeItem(item, language)),
    });
  } catch (error) {
    console.error("help search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search help center",
    });
  }
});

router.get("/item/:id", detectSeller, async (req, res) => {
  try {
    const language = normalizeLanguage(req.query.language);
    const item = await HelpItem.findOne({
      where: {
        id: req.params.id,
        is_published: true,
      },
      include: [
        {
          model: HelpTranslation,
          as: "translations",
          required: false,
        },
      ],
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Help item not found",
      });
    }

    await trackEvent({
      help_item_id: item.id,
      seller_id: getSellerId(req),
      event_type: "question_open",
      metadata: { language },
    });

    const children = await HelpItem.findAll({
      where: {
        parent_id: item.id,
        is_published: true,
      },
      include: [
        {
          model: HelpTranslation,
          as: "translations",
          required: false,
        },
      ],
      order: [
        ["sort_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    const data = serializeItem(item, language);
    data.children = children
      .map((child) => serializeItem(child, language))
      .filter((child) => child.title || child.answer);

    res.json({ success: true, data });
  } catch (error) {
    console.error("help item error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load help item",
    });
  }
});

router.post("/feedback", detectSeller, async (req, res) => {
  try {
    const helpItemId = Number(req.body.help_item_id);
    const feedbackType = req.body.feedback_type;

    if (!helpItemId || !["helpful", "not_helpful"].includes(feedbackType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid feedback payload",
      });
    }

    const item = await HelpItem.findByPk(helpItemId, {
      attributes: ["id"],
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Help item not found",
      });
    }

    const sellerId = getSellerId(req);
    await HelpFeedback.create({
      help_item_id: helpItemId,
      seller_id: sellerId,
      feedback_type: feedbackType,
    });

    await trackEvent({
      help_item_id: helpItemId,
      seller_id: sellerId,
      event_type: feedbackType,
    });

    res.json({
      success: true,
      message: "Thanks for your feedback",
    });
  } catch (error) {
    console.error("help feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save feedback",
    });
  }
});

export default router;
