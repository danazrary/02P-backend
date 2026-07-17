const BAGHDAD_OFFSET = "+03:00";
const LOCAL_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export function parseOptionalCashbackDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;

  const normalizedValue =
    typeof value === "string" && LOCAL_DATE_TIME_PATTERN.test(value)
      ? `${value}${BAGHDAD_OFFSET}`
      : value;

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    err.clientMessage = `${fieldName} must be a valid date.`;
    throw err;
  }

  return parsed;
}