// migrate-seller-to-sellerv2.js
//
// One-time migration script: copies every row from the old `seller` table
// into the new `sellers_v2` table (your v2 schema).
//
// SAFETY
//   - This script only ever SELECTs from the old `seller` table (via
//     SellerOld.findAll). It never UPDATEs, DELETEs, or TRUNCATEs it.
//     Your original ~120 rows in `seller` are left exactly as they are.
//   - Safe to run more than once: any seller `id` that already exists in
//     `sellers_v2` is SKIPPED by default, so it won't stomp on records you
//     already migrated/edited by hand. Pass --overwrite if you explicitly
//     want to re-sync already-migrated rows from the old table.
//   - Supports --dry-run to show exactly what would happen, with zero
//     writes to sellers_v2.
//
// USAGE (run on your VPS, in the same folder as seller.js / sellerv2.js /
// sequelize.js — adjust the three import paths below if you place this
// file somewhere else):
//
//   node migrate-seller-to-sellerv2.js              // real run, skip existing
//   node migrate-seller-to-sellerv2.js --dry-run    // preview only, no writes
//   node migrate-seller-to-sellerv2.js --overwrite  // also re-sync existing v2 rows
//
// It prints a summary at the end (migrated / skipped / failed) and, for any
// failed row, the exact error so you can fix that one record by hand — a
// failure on one seller never stops the rest from migrating.

import sequelize from "../database/sequelize.js";
import SellerOld from "../database/seller.js";
import SellerV2 from "../database/sellerv2.js";


const DRY_RUN = process.argv.includes("--dry-run");
const OVERWRITE = process.argv.includes("--overwrite");

// Fallback brand_color shape for sellers who never set one, matching the
// column default already defined on the sellersV2 model.
const DEFAULT_BRAND_COLOR = {
  primary: "#5d5fef",
  bg: "#ffffff",
  text: "#0b0b0f",
};

// The old table has some junk sentinel values (the literal string "null",
// empty strings) instead of real NULLs — e.g. one legacy Facebook-only
// signup has email/phone/shop_name all stored as the string "null". Treat
// those as actual NULL so they don't collide with each other under the new
// unique constraints on email / shop_name.
function cleanString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

// Old brand_color was a single hex string (or null).
// New brand_color is a JSON object { primary, bg, text }.
function migrateBrandColor(oldValue) {
  const cleaned = cleanString(oldValue);
  if (!cleaned) return DEFAULT_BRAND_COLOR;
  return { ...DEFAULT_BRAND_COLOR, primary: cleaned };
}

// sellers_v2.shop_name is NOT NULL + UNIQUE, but the old table allows NULL
// (and has some duplicate/placeholder junk values). This builds a resolver
// that guarantees every migrated row gets a unique, non-null shop_name:
// missing names become "seller-<id>", and collisions get a numeric suffix.
function buildShopNameResolver(existingNames) {
  const used = new Set(existingNames.filter(Boolean));
  return function resolveShopName(oldShopName, id) {
    const base = cleanString(oldShopName) || `seller-${id}`;
    let candidate = base;
    let n = 1;
    while (used.has(candidate)) {
      candidate = `${base}-${n++}`;
    }
    used.add(candidate);
    return candidate;
  };
}

// Builds one sellers_v2-shaped row from one old seller row.
function buildNewRow(oldRow, resolveShopName) {
  return {
    id: oldRow.id, // keep the same primary key in both tables

    googleId: cleanString(oldRow.googleId),
    facebookId: cleanString(oldRow.facebookId),
    tiktokId: cleanString(oldRow.tiktokId),
    name: cleanString(oldRow.name),
    email: cleanString(oldRow.email),
    password_hash: oldRow.password_hash ?? null,
    email_verified: !!oldRow.email_verified,
    verification_code: oldRow.verification_code ?? null,
    code_expires: oldRow.code_expires ?? null,
    needsManualEmail: !!oldRow.needsManualEmail,
    phone: cleanString(oldRow.phone),

    shop_name: resolveShopName(oldRow.shop_name, oldRow.id),
    shop_image: oldRow.shop_image ?? null,
    bio: oldRow.bio ?? null,

    // Columns that don't exist on the old table yet — sensible v2 defaults.
    business_type: "retail",
    store_visibility: "public",
    private_store_passcode: null,
    parent_wholesale_id: null,
    min_order_amount: 0,
    min_order_quantity: 1,
    staff_members: [],
    city: null,
    ai_credits_balance: 0,
    is_active: true,
    last_login: null,

    shop_location: oldRow.shop_location ?? null,
    social_links: oldRow.social_links ?? undefined, // undefined -> model default kicks in
    categories: oldRow.categories ?? null,
    subcategories_map: oldRow.subcategories_map ?? null,
    category_translations: oldRow.category_translations ?? null,
    category_images: oldRow.category_images ?? null,

    brand_color: migrateBrandColor(oldRow.brand_color),
    red_line: oldRow.red_line ?? null,
    red_lineAr: oldRow.red_lineAr ?? null,
    product_badges: oldRow.product_badges ?? [],

    ui_settings: oldRow.ui_settings ?? null,
    default_shop_lang: oldRow.default_shop_lang || "ku",
    order_type: oldRow.order_type || "both",

    terms_accepted_at: oldRow.terms_accepted_at ?? null,
    deletion_requested_at: oldRow.deletion_requested_at ?? null,

    created_at: oldRow.createdAt ?? new Date(),
    updated_at: oldRow.updatedAt ?? new Date(),
  };
}

async function migrate() {
  console.log(
    `Starting migration  (dry-run: ${DRY_RUN}, overwrite: ${OVERWRITE})`,
  );

  await sequelize.authenticate();

  // Read-only fetch — this is the ONLY query this script ever runs
  // against the old `seller` table.
  const oldSellers = await SellerOld.findAll({ raw: true });
  console.log(`Found ${oldSellers.length} sellers in the old "seller" table.`);

  const existingV2 = await SellerV2.findAll({
    attributes: ["id", "shop_name"],
    raw: true,
  });
  const existingIds = new Set(existingV2.map((r) => r.id));
  const resolveShopName = buildShopNameResolver(
    existingV2.map((r) => r.shop_name),
  );

  const results = { migrated: [], skipped: [], failed: [] };

  for (const oldRow of oldSellers) {
    const alreadyMigrated = existingIds.has(oldRow.id);

    if (alreadyMigrated && !OVERWRITE) {
      results.skipped.push({
        id: oldRow.id,
        reason: "already exists in sellers_v2",
      });
      continue;
    }

    try {
      const newRow = buildNewRow(oldRow, resolveShopName);

      if (DRY_RUN) {
        results.migrated.push({
          id: oldRow.id,
          shop_name: newRow.shop_name,
          mode: "dry-run, not written",
        });
        continue;
      }

      if (alreadyMigrated && OVERWRITE) {
        await SellerV2.update(newRow, { where: { id: oldRow.id } });
      } else {
        await SellerV2.create(newRow);
      }

      results.migrated.push({ id: oldRow.id, shop_name: newRow.shop_name });
    } catch (err) {
      results.failed.push({ id: oldRow.id, error: err.message });
    }
  }

  console.log("\n--- Migration summary ---");
  console.log(`Migrated: ${results.migrated.length}`);
  console.log(`Skipped (already in sellers_v2): ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length) {
    console.log(
      "\nFailed rows (old `seller` data is untouched — fix and re-run, it will pick these up):",
    );
    for (const f of results.failed) {
      console.log(`  id=${f.id}: ${f.error}`);
    }
  }

  await sequelize.close();
}

migrate().catch((err) => {
  console.error("Migration crashed:", err);
  process.exit(1);
});
// node databaseFixing/migrateSellersToV2.js --dry-run
//node databaseFixing/migrateSellersToV2.js