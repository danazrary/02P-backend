-- Create subscription_extension_logs table
-- This table tracks all subscription extensions made by admins

CREATE TABLE IF NOT EXISTS `subscription_extension_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `seller_id` INT UNSIGNED NOT NULL,
  `seller_name` VARCHAR(255) NOT NULL,
  `previous_expiration_date` DATETIME NOT NULL,
  `days_added` INT NOT NULL,
  `new_expiration_date` DATETIME NOT NULL,
  `admin_id` INT UNSIGNED,
  `admin_email` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE CASCADE ON DELETE SET NULL,
  
  INDEX `idx_seller_id` (`seller_id`),
  INDEX `idx_admin_id` (`admin_id`),
  INDEX `idx_created_at` (`created_at`)
);
