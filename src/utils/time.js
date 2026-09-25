const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Today's IST calendar date as "YYYY-MM-DD", derived from a UTC instant. */
export function getISTDateString(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

/** "MON"/"TUE"/... matching office_setting.weekly_off SET values (IST calendar day). */
export function getWeekdayAbbrev(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return WEEKDAY_NAMES[ist.getUTCDay()];
}

export function getWeekdayAbbrevForDateString(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return WEEKDAY_NAMES[d.getUTCDay()];
}

/**
 * Combines an IST calendar date ("YYYY-MM-DD") with an IST wall-clock time
 * ("HH:MM" or "HH:MM:SS", e.g. employee.expected_login_time) and returns
 * the equivalent UTC Date instant.
 */
export function istDateTimeToUtcDate(dateStr, timeStr) {
  const [h, m, s = "00"] = timeStr.split(":");
  const asIfUtc = new Date(`${dateStr}T${h}:${m}:${s}Z`);
  return new Date(asIfUtc.getTime() - IST_OFFSET_MS);
}

// /**
//  * Parses a DATETIME string coming back from mysql2 (dateStrings:true,
//  * session timezone "+00:00") - the string represents UTC, but has no
//  * timezone suffix, so we add one before parsing.
//  */
// export function parseDbDatetimeUtc(str) {
//   return new Date(`${str.replace(" ", "T")}Z`);
// }

/**
 * Safely parses DATETIME representation into a UTC Date object.
 * Date object, string ('YYYY-MM-DD HH:mm:ss' ya ISO), sab handle karta hai.
 */
export function parseDbDatetimeUtc(val) {
  if (!val) return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  if (typeof val === "string") {
    const formatted = val.includes("T")
      ? (val.endsWith("Z") ? val : `${val}Z`)
      : `${val.replace(" ", "T")}Z`;

    const parsed = new Date(formatted);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof val === "number") {
    return new Date(val);
  }

  return null;
}

export function diffInMinutes(laterDate, earlierDate) {
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / 60000);
}

/** Adds (or subtracts, with a negative n) days to an IST calendar date string. */
export function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}