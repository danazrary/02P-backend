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
        try {
          const redLineData =
            typeof seller.red_line === "string"
              ? JSON.parse(seller.red_line)
              : seller.red_line;

          if (
            redLineData &&
            typeof redLineData === "object" &&
            redLineData.end_time
          ) {
            const endTime = new Date(redLineData.end_time);
            console.log(
              `🔍 Seller ${seller.id} (${seller.name}) Kurdish: end_time=${endTime.toISOString()}, expired=${endTime < currentDate}`,
            );

            if (endTime < currentDate) {
              updateObj.red_line = null;
            }
          }
        } catch (error) {
          console.error(
            `Error parsing red_line for seller ${seller.id}:`,
            error,
          );
          updateObj.red_line = null;
        }
      }

      // Check Arabic red_lineAr
      if (seller.red_lineAr) {
        try {
          const redLineData =
            typeof seller.red_lineAr === "string"
              ? JSON.parse(seller.red_lineAr)
              : seller.red_lineAr;

          if (
            redLineData &&
            typeof redLineData === "object" &&
            redLineData.end_time
          ) {
            const endTime = new Date(redLineData.end_time);
            console.log(
              `🔍 Seller ${seller.id} (${seller.name}) Arabic: end_time=${endTime.toISOString()}, expired=${endTime < currentDate}`,
            );

            if (endTime < currentDate) {
              updateObj.red_lineAr = null;
            }
          }
        } catch (error) {
          console.error(
            `Error parsing red_lineAr for seller ${seller.id}:`,
            error,
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
