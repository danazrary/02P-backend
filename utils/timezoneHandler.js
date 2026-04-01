/**
 * Timezone Handler Utility
 * Handles all date/time operations in Iraq timezone (Asia/Baghdad)
 * Stores all dates in UTC (ISO string format)
 * Compares all dates in Iraq timezone
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Extend dayjs with UTC and timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const IRAQ_TZ = "Asia/Baghdad";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UTC CONVERSION UTILITY
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL: All dates MUST be stored in the database as UTC ISO strings (toISOString())
 * This ensures consistency across servers in any timezone (local dev, VPS, etc.)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Convert any date input to UTC ISO string for database storage
 * 
 * @param {string|Date|null} date - Date to convert
 * @returns {string|null} UTC ISO string (e.g. "2026-04-01T16:59:00.000Z") or null
 * 
 * USAGE:
 *   // For creating a new record:
 *   await Model.create({
 *     start_date: toUTC(req.body.startDate),  // ← Always use toUTC()
 *     end_date: toUTC(req.body.endDate)
 *   });
 *
 *   // For updating:
 *   await Model.update({
 *     updated_at: toUTC(new Date())  // ← Always store as UTC
 *   });
 */
export function toUTC(date) {
  if (!date) return null;

  try {
    // If already a UTC ISO string (contains 'Z'), return as-is
    if (typeof date === "string" && date.includes("Z")) {
      return date;
    }

    // Convert to UTC ISO string
    const d = new Date(date);
    if (isNaN(d)) return null;

    return d.toISOString();
  } catch (error) {
    console.error("Error converting date to UTC:", date, error);
    return null;
  }
}

/**
 * Get current time in Iraq timezone
 * @returns {Object} { utc: ISO string, baghdad: formatted Baghdad time }
 */
export function getCurrentTimeBaghdad() {
  const utcNow = dayjs.utc();
  const baghdadNow = utcNow.tz(IRAQ_TZ);

  return {
    utc: utcNow.toISOString(),
    baghdad: baghdadNow.format("YYYY-MM-DD HH:mm:ss"),
    baghdadFull: baghdadNow,
  };
}

/**
 * Parse any date input (string or Date) to Baghdad timezone
 * @param {string|Date|dayjs.Dayjs} date - Date to parse
 * @returns {Object} { utc: ISO string, baghdad: formatted Baghdad time, dayjsObj: dayjs object }
 */
export function parseDateToUTC(date) {
  if (!date) return null;

  try {
    let dayjsObj;

    if (typeof date === "string") {
      // Handle ISO strings, date strings, etc.
      dayjsObj = dayjs(date);
    } else if (date instanceof Date) {
      // Handle JavaScript Date objects
      dayjsObj = dayjs(date);
    } else if (dayjs.isDayjs(date)) {
      // Already a dayjs object
      dayjsObj = date;
    } else {
      return null;
    }

    if (!dayjsObj.isValid()) {
      return null;
    }

    return {
      utc: dayjsObj.utc().toISOString(),
      baghdad: dayjsObj.tz(IRAQ_TZ).format("YYYY-MM-DD HH:mm:ss"),
      dayjsObj: dayjsObj,
    };
  } catch (error) {
    console.error("Error parsing date:", date, error);
    return null;
  }
}

/**
 * Convert UTC timestamp to Baghdad timezone for display
 * @param {string|Date} utcDate - UTC date (usually from database)
 * @returns {string} Formatted date in Baghdad timezone
 */
export function utcToBaghdadDisplay(utcDate) {
  const parsed = parseDateToUTC(utcDate);
  return parsed ? parsed.baghdad : null;
}

/**
 * Compare two dates in Baghdad timezone
 * @param {string|Date} date1 - First date
 * @param {string|Date} date2 - Second date
 * @returns {number} -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDatesBaghdad(date1, date2) {
  const parsed1 = parseDateToUTC(date1);
  const parsed2 = parseDateToUTC(date2);

  if (!parsed1 || !parsed2) return null;

  const tz1 = parsed1.dayjsObj.tz(IRAQ_TZ);
  const tz2 = parsed2.dayjsObj.tz(IRAQ_TZ);

  if (tz1.isBefore(tz2)) return -1;
  if (tz1.isAfter(tz2)) return 1;
  return 0;
}

/**
 * Check if a date is between two other dates in Baghdad timezone
 * @param {string|Date} checkDate - Date to check
 * @param {string|Date} startDate - Start of range
 * @param {string|Date} endDate - End of range
 * @returns {boolean} True if checkDate is between startDate and endDate (inclusive)
 */
export function isBetweenBaghdad(checkDate, startDate, endDate) {
  const parsedCheck = parseDateToUTC(checkDate);
  const parsedStart = parseDateToUTC(startDate);
  const parsedEnd = parseDateToUTC(endDate);

  if (!parsedCheck || !parsedStart || !parsedEnd) return false;

  const checkTz = dayjs(parsedCheck.utc).tz(IRAQ_TZ);
  const startTz = dayjs(parsedStart.utc).tz(IRAQ_TZ);
  const endTz = dayjs(parsedEnd.utc).tz(IRAQ_TZ);

  return (
    (checkTz.isSame(startTz) || checkTz.isAfter(startTz)) &&
    (checkTz.isSame(endTz) || checkTz.isBefore(endTz))
  );
}

/**
 * Determine red_line status based on start_time and end_time (Baghdad timezone)
 * @param {string|Date} startTime - Start time (UTC stored)
 * @param {string|Date} endTime - End time (UTC stored)
 * @returns {string} "coming_soon" | "active" | "expired"
 */
export function getRedLineStatus(startTime, endTime) {
  if (!startTime || !endTime) return null;

  const parsedStart = parseDateToUTC(startTime);
  const parsedEnd = parseDateToUTC(endTime);

  if (!parsedStart || !parsedEnd) return null;

  // Get current time as UTC dayjs object, then apply timezone for consistent comparison
  const currentUTC = dayjs.utc();
  const startTz = dayjs(parsedStart.utc).tz(IRAQ_TZ);
  const endTz = dayjs(parsedEnd.utc).tz(IRAQ_TZ);
  const currentTz = currentUTC.tz(IRAQ_TZ);

  if (currentTz.isBefore(startTz)) {
    return "coming_soon";
  } else if (
    (currentTz.isSame(startTz) || currentTz.isAfter(startTz)) &&
    (currentTz.isSame(endTz) || currentTz.isBefore(endTz))
  ) {
    return "active";
  } else {
    return "expired";
  }
}

/**
 * Check if a date has expired in Baghdad timezone
 * @param {string|Date} endTime - End time (UTC stored)
 * @returns {boolean} True if endTime has passed
 */
export function isExpiredBaghdad(endTime) {
  const endTimeParsed = parseDateToUTC(endTime);

  if (!endTimeParsed) return true; // Invalid date is considered expired

  const currentUTC = dayjs.utc();
  const currentTz = currentUTC.tz(IRAQ_TZ);
  const endTz = dayjs(endTimeParsed.utc).tz(IRAQ_TZ);
  
  return currentTz.isAfter(endTz);
}

/**
 * Parse red_line data from database (handles string or object)
 * @param {string|object} redLineData - Raw red_line data from database
 * @returns {object|null} Parsed red_line data or null
 */
export function safeParseRedLineData(redLineData) {
  if (!redLineData) return null;

  try {
    if (typeof redLineData === "string") {
      return JSON.parse(redLineData);
    }
    if (typeof redLineData === "object") {
      return redLineData;
    }
  } catch (error) {
    console.error("Error parsing red_line data:", error);
  }
  return null;
}

/**
 * Validate red_line data structure
 * @param {object} redLineData - Parsed red_line data
 * @returns {boolean} True if valid
 */
export function isValidRedLineData(redLineData) {
  return (
    redLineData &&
    typeof redLineData === "object" &&
    redLineData.start_time &&
    redLineData.end_time
  );
}

/**
 * Process red_line: determine status and if cleanup is needed
 * @param {string|object} rawRedLineData - Raw red_line from database
 * @returns {object} { data, status, needsCleanup }
 */
export function processRedLineData(rawRedLineData) {
  const parsed = safeParseRedLineData(rawRedLineData);

  if (!isValidRedLineData(parsed)) {
    return { data: null, status: null, needsCleanup: true };
  }

  const status = getRedLineStatus(parsed.start_time, parsed.end_time);

  // Mark for cleanup if expired
  const needsCleanup = status === "expired";

  return {
    data: needsCleanup ? null : parsed,
    status,
    needsCleanup,
  };
}

/**
 * Format dates in red_line object for storage (convert to UTC ISO strings)
 * @param {object} redLineObj - Red line object with start_time and end_time
 * @returns {object} Red line object with UTC ISO string timestamps
 */
export function formatRedLineForStorage(redLineObj) {
  if (!redLineObj) return null;

  const startParsed = parseDateToUTC(redLineObj.start_time);
  const endParsed = parseDateToUTC(redLineObj.end_time);

  if (!startParsed || !endParsed) return null;

  return {
    ...redLineObj,
    start_time: startParsed.utc,
    end_time: endParsed.utc,
    created_at: getCurrentTimeBaghdad().utc,
  };
}

/**
 * Format red_line response data (include both UTC and Baghdad display times)
 * @param {object} redLineData - Red line data from database
 * @returns {object} Formatted response with display times
 */
export function formatRedLineResponse(redLineData) {
  if (!redLineData) return null;

  return {
    ...redLineData,
    start_time_utc: redLineData.start_time,
    start_time_display: utcToBaghdadDisplay(redLineData.start_time),
    end_time_utc: redLineData.end_time,
    end_time_display: utcToBaghdadDisplay(redLineData.end_time),
    created_at_utc: redLineData.created_at,
    created_at_display: utcToBaghdadDisplay(redLineData.created_at),
    status: getRedLineStatus(redLineData.start_time, redLineData.end_time),
  };
}
