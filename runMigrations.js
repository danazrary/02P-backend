/**
 * Database Migration Runner
 * Run this file to execute all pending migrations
 *
 * Usage: node backend/runMigrations.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Sequelize connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql",
    logging: console.log,
  },
);

const runMigrations = async () => {
  try {
    console.log("🔄 Starting database migrations...\n");

    // Get list of migration files
    const migrationsDir = path.join(__dirname, "database", "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".cjs"))
      .sort();

    console.log(`📋 Found ${migrationFiles.length} migration files:\n`);

    // Execute each migration
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);

      try {
        console.log(`⏳ Running: ${file}`);

        // Dynamically import the migration
        const migration = await import(`file://${filePath}`);
        const migrationModule = migration.default || migration;

        // Execute the up function
        await migrationModule.up(sequelize.getQueryInterface(), Sequelize);

        console.log(`✅ Completed: ${file}\n`);
      } catch (error) {
        console.error(`❌ Error in ${file}:`, error.message);
        if (error.message.includes("already exists")) {
          console.log(`   (Table already exists, skipping)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log("✅ All migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

runMigrations();
