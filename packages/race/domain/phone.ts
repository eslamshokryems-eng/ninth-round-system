/**
 * Mirror of race_normalize_phone() (supabase/migrations/20260929000002). Used
 * for instant UI feedback only — the database is the authority and applies
 * the same rule for duplicate detection and search. The shared cases in
 * parity-cases.json are asserted against BOTH implementations.
 */
/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII, exactly as the SQL translate() does. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => String((ch.codePointAt(0) ?? 0) % 16 % 10));
}

export function normalizePhone(input: string | null | undefined): string {
  const digits = toAsciiDigits(input ?? "").replace(/[^0-9]/g, "");
  if (digits.startsWith("0020")) return `0${digits.slice(4)}`;
  if (/^20[0-9]{10}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^1[0-9]{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

export function isPlausiblePhone(input: string | null | undefined): boolean {
  const n = normalizePhone(input).length;
  return n >= 8 && n <= 15;
}
