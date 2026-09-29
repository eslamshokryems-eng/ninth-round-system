import { toAsciiDigits } from "./phone";

/** Race numbers are N001–N9999, issued by the database (race_event_counters) — this only formats and parses them. */
export const RACE_NUMBER_PATTERN = /^N[0-9]{3,4}$/;

export function formatRaceNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new RangeError(`Race number sequence must be an integer 1..9999 (got ${sequence})`);
  }
  return `N${String(sequence).padStart(3, "0")}`;
}

/**
 * Reception's preferred search is by race number. "27", "n27", "N027", "027"
 * all mean N027. Returns null when the text is not a race-number query (so the
 * caller falls back to phone/name search) — same rule as race_list_registrations().
 */
export function parseRaceNumberQuery(query: string): string | null {
  const q = toAsciiDigits(query.trim());
  if (!/^n?[0-9]{1,4}$/i.test(q)) return null;
  const digits = q.replace(/[^0-9]/g, "");
  const sequence = Number(digits);
  if (sequence < 1) return null;
  return formatRaceNumber(sequence);
}
