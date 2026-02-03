import Seller from "../database/seller.js";
import SellerOffer from "../database/sellerOffer.js";
import { Op } from "sequelize";

/**
 * Clean up expired red lines and offers from the database
 */
export async function cleanupExpiredData() {
  try {
    const currentDate = new Date();
    console.log("🧹 Starting cleanup of expired data...");
    console.log("📅 Current date:", currentDate.toISOString());

    // 1️⃣ Clean up expired red lines
    const sellers = await Seller.findAll({
      attributes: ["id", "name", "red_line"],
    });

    console.log(`📊 Found ${sellers.length} total sellers`);

    let redLinesRemoved = 0;
    for (const seller of sellers) {
      // Skip if red_line is null or undefined
      if (!seller.red_line) continue;

      try {
        const redLineData =
          typeof seller.red_line === "string"
            ? JSON.parse(seller.red_line)
            : seller.red_line;

        // Skip if empty object or no end_time
        if (
          !redLineData ||
          typeof redLineData !== "object" ||
          !redLineData.end_time
        ) {
          continue;
        }

        const endTime = new Date(redLineData.end_time);
        console.log(
          `🔍 Seller ${seller.id} (${seller.name}): end_time=${endTime.toISOString()}, expired=${endTime < currentDate}`,
        );

        if (endTime < currentDate) {
          await Seller.update({ red_line: null }, { where: { id: seller.id } });
          console.log(`❌ Removed expired red_line for seller ${seller.id}`);
          redLinesRemoved++;
        }
      } catch (error) {
        console.error(`Error parsing red_line for seller ${seller.id}:`, error);
      }
    }

    // 2️⃣ Clean up expired offers (DELETE them from database)
    const expiredOffers = await SellerOffer.destroy({
      where: {
        end_date: {
          [Op.lt]: currentDate,
        },
      },
    });

    console.log(`✅ Cleanup complete:`);
    console.log(`   - Red lines removed: ${redLinesRemoved}`);
    console.log(`   - Offers deleted: ${expiredOffers}`);

    return {
      redLinesRemoved,
      offersDeactivated: expiredOffers[0],
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
