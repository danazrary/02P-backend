-- ============================================================
-- R2 Storage System Migration
-- Run these statements in order.
-- ============================================================

-- 1. Add storage_limit_mb column to plans table
-- Default = 500 MB; adjust per plan after migration.
ALTER TABLE plans
  ADD COLUMN storage_limit_mb DECIMAL(10,2) NOT NULL DEFAULT 500
    COMMENT 'Maximum R2 storage (MB) allowed for this plan';

-- Update per-plan limits (edit values to match your pricing tiers)
-- UPDATE plans SET storage_limit_mb = 200  WHERE name = 'small'  OR name = 'Starter';
-- UPDATE plans SET storage_limit_mb = 1000 WHERE name = 'medium' OR name = 'Pro';
-- UPDATE plans SET storage_limit_mb = 5000 WHERE name = 'large'  OR name = 'Business';

-- ============================================================
-- 2. Create seller_usage table
-- ============================================================
CREATE TABLE IF NOT EXISTS seller_usage (
  seller_id        INT           NOT NULL,
  storage_used_mb  DECIMAL(12,4) NOT NULL DEFAULT 0,
  updatedAt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (seller_id),
  CONSTRAINT fk_seller_usage_seller
    FOREIGN KEY (seller_id) REFERENCES sellers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. Create product_images table
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
  id          INT           NOT NULL AUTO_INCREMENT,
  product_id  INT           NOT NULL,
  image_key   VARCHAR(512)  NOT NULL
                COMMENT 'R2 object key, e.g. shops/123/products/456/uuid.webp',
  is_main     TINYINT(1)    NOT NULL DEFAULT 0,
  size_bytes  INT               NULL
                COMMENT 'WebP file size in bytes for storage accounting',
  createdAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_images_product_id (product_id),
  CONSTRAINT fk_product_images_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. (Optional) Migrate existing VPS image paths
--    These statements mark legacy images by appending them to
--    product_images with the raw `/uploads/...` key.
--    The frontend imageUrl.js will resolve them correctly.
--
--    Run only if you want a DB record per legacy image.
--    Otherwise existing products continue to fall back to
--    the `images` JSON column automatically.
-- ============================================================
/*
INSERT INTO product_images (product_id, image_key, is_main, size_bytes)
SELECT
  p.id                  AS product_id,
  JSON_UNQUOTE(
    JSON_EXTRACT(p.images, CONCAT('$[', idx.n, ']'))
  )                     AS image_key,
  (idx.n = 0)           AS is_main,
  NULL                  AS size_bytes
FROM products p
JOIN (
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2
  UNION ALL SELECT 3 UNION ALL SELECT 4
) idx
WHERE JSON_EXTRACT(p.images, CONCAT('$[', idx.n, ']')) IS NOT NULL
  AND p.images IS NOT NULL
  AND JSON_LENGTH(p.images) > idx.n;
*/

-- ============================================================
-- Done
-- ============================================================
