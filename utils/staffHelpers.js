// backend/utils/staffHelpers.js
//
// Helpers for the `staff_members` JSON column of the seller table.

/**
 * Always returns a fresh array, whatever the driver gives back
 * (array, JSON string, null or broken JSON).
 */
export function extractStaffArray(seller) {
  if (!seller || !seller.staff_members) return [];
  if (Array.isArray(seller.staff_members)) return [...seller.staff_members];
  if (typeof seller.staff_members === "string") {
    try {
      const parsed = JSON.parse(seller.staff_members);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function findStaffById(seller, staffId) {
  return extractStaffArray(seller).find((s) => s.staff_id === staffId) || null;
}

/** Removes secrets before a staff record is sent to a client. */
export function toPublicStaff(member) {
  if (!member) return member;
  const { password_hash, ...rest } = member;
  return rest;
}
