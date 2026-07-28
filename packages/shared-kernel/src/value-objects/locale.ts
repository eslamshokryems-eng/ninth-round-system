/**
 * The two locales 9th Round ships with on day one (docs/11-internationalization.md).
 * Modeled as a value object, not a bare string, so "is this a supported
 * locale" and "is this RTL" are answered in one place instead of re-checked
 * with an inline `=== "ar"` at every call site.
 */
export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = "en";

const RTL_LOCALES: ReadonlySet<LocaleCode> = new Set(["ar"]);

export function isSupportedLocale(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: LocaleCode): boolean {
  return RTL_LOCALES.has(locale);
}

export function textDirection(locale: LocaleCode): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/**
 * Reads a `translated_text` DB column (`{"en": "...", "ar": "..."}`, see
 * supabase/migrations/20260801000004_training_content.sql) for a given
 * locale, always falling back to English — the schema guarantees `en` is
 * present, so this can never return `undefined`.
 */
export type TranslatedText = Partial<Record<LocaleCode, string>> & { en: string };

export function translate(text: TranslatedText, locale: LocaleCode): string {
  return text[locale] ?? text.en;
}
