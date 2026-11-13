// Calendar-day boundaries in Asia/Kolkata (IST). IST is a fixed UTC+5:30 offset
// with NO daylight saving, so this is exact without any timezone database.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The IST calendar day (YYYY-MM-DD) that `date` falls on. */
export function istDay(date: Date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of the next IST midnight after `date` (i.e. when the daily quota resets). */
export function nextIstMidnight(date: Date = new Date()): Date {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const nextMidnightAsUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(nextMidnightAsUtc - IST_OFFSET_MS);
}
