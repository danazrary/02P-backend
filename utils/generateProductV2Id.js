// backend/utils/generateProductV2Id.js
import ProductV2 from "../database/productv2.js";

const MIN_ID = 100000; // ٦ ژمارەیی — سنووری خوارەوە (١٠٠٠٠٠)
const MAX_ID = 999999; // ٦ ژمارەیی — سنووری سەرەوە (٩٩٩٩٩٩)
const MAX_ATTEMPTS = 15;

function randomSixDigitId() {
  return Math.floor(Math.random() * (MAX_ID - MIN_ID + 1)) + MIN_ID;
}

/**
 * Generates a random 6-digit product ID (100000–999999) that isn't
 * already in use. Checked against the DB rather than assumed unique,
 * since the ~900,000-value space can collide once enough products
 * exist. Throws if it can't find a free ID within MAX_ATTEMPTS — at
 * that point the ID space is nearly exhausted and needs a wider range.
 */
export async function generateUniqueProductV2Id() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomSixDigitId();
    const existing = await ProductV2.findByPk(candidate, {
      attributes: ["id"],
    });
    if (!existing) return candidate;
  }

  const err = new Error(
    "Could not generate a unique 6-digit product ID after multiple attempts. The ID space may be nearly full.",
  );
  err.statusCode = 500;
  throw err;
}
