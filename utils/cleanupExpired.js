import Seller from "../database/seller.js";
import SellerOffer from "../database/sellerOffer.js";
import { Op } from "sequelize";
import {
  processRedLineData,
  getCurrentTimeBaghdad,
} from "./timezoneHandler.js";
import { permanentlyDeleteSellerAccount } from "../routers/seller/deleteAccount.js";

/**
 * Clean up expired red lines and offers from the database
 * Uses Baghdad timezone for all comparisons
 */
export async function cleanupExpiredData() {
  try {
    const {
      utc: currentTimeUTC,
      baghdad: currentTimeBaghdad,
      baghdadFull,
    } = getCurrentTimeBaghdad();
    console.log("🧹 Starting cleanup of expired data...");
    console.log("📅 Current UTC:", currentTimeUTC);
    console.log("📅 Current Baghdad:", currentTimeBaghdad);

    // 0️⃣ Clean up accounts scheduled for deletion (30 days passed)
    // Use Baghdad timezone for consistent 30-day calculation
    const thirtyDaysAgoBaghdad = baghdadFull.subtract(30, "day").toDate();
    const sellersToDelete = await Seller.findAll({
      where: {
        deletion_requested_at: {
          [Op.lte]: thirtyDaysAgoBaghdad, // deletion was requested 30+ days ago (Baghdad time)
        },
      },
      attributes: ["id", "name", "email"],
    });

    console.log(
      `🗑️ Found ${sellersToDelete.length} accounts scheduled for permanent deletion`,
    );

    let accountsDeleted = 0;
    for (const seller of sellersToDelete) {
      console.log(
        `🗑️ Deleting seller account: ${seller.id} (${seller.email || seller.name})`,
      );
      const result = await permanentlyDeleteSellerAccount(seller.id);
      if (result.success) {
        accountsDeleted++;
        console.log(`✅ Deleted seller ${seller.id}`);
      } else {
        console.error(
          `❌ Failed to delete seller ${seller.id}: ${result.message}`,
        );
      }
    }

    // 1️⃣ Clean up expired red lines (both Kurdish and Arabic)
    const sellers = await Seller.findAll({
      attributes: ["id", "name", "red_line", "red_lineAr"],
    });

    console.log(`📊 Found ${sellers.length} total sellers`);

    let redLinesRemoved = 0;
    for (const seller of sellers) {
      const updateObj = {};

      // Check Kurdish red_line
      if (seller.red_line) {
        const kuResult = processRedLineData(seller.red_line);
        if (kuResult.needsCleanup) {
          console.log(
            `🔍 Seller ${seller.id} (${seller.name}) Kurdish: status=${kuResult.status}, marking for cleanup`,
          );
          updateObj.red_line = null;
        }
      }

      // Check Arabic red_lineAr
      if (seller.red_lineAr) {
        const arResult = processRedLineData(seller.red_lineAr);
        if (arResult.needsCleanup) {
          console.log(
            `🔍 Seller ${seller.id} (${seller.name}) Arabic: status=${arResult.status}, marking for cleanup`,
          );
          updateObj.red_lineAr = null;
        }
      }

      // Update if any cleanup needed
      if (Object.keys(updateObj).length > 0) {
        await Seller.update(updateObj, { where: { id: seller.id } });
        if (updateObj.red_line !== undefined) {
          console.log(
            `❌ Removed expired red_line (Kurdish) for seller ${seller.id}`,
          );
          redLinesRemoved++;
        }
        if (updateObj.red_lineAr !== undefined) {
          console.log(
            `❌ Removed expired red_lineAr (Arabic) for seller ${seller.id}`,
          );
          redLinesRemoved++;
        }
      }
    }

    // 2️⃣ Clean up expired offers (DELETE them from database)
    // Use the UTC timestamp for database comparison
    const expiredOffers = await SellerOffer.destroy({
      where: {
        end_date: {
          [Op.lt]: new Date(currentTimeUTC),
        },
      },
    });

    console.log(`✅ Cleanup complete:`);
    console.log(`   - Seller accounts deleted: ${accountsDeleted}`);
    console.log(`   - Red lines removed: ${redLinesRemoved}`);
    console.log(`   - Offers deleted: ${expiredOffers}`);

    return {
      accountsDeleted,
      redLinesRemoved,
      offersDeactivated: expiredOffers,
    };
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  }
}

/**
 * Schedule cleanup to run periodically (every 6 hours)
 */
export function scheduleCleanup() {
  // Run cleanup immediately on startup
  cleanupExpiredData();

  // Then run every 6 hours (6 * 60 * 60 * 1000 milliseconds)
  const sixHours = 6 * 60 * 60 * 1000;
  setInterval(() => {
    cleanupExpiredData();
  }, sixHours);

  console.log("⏰ Cleanup scheduler initialized (runs every 6 hours)");
}
