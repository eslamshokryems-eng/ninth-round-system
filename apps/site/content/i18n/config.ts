/**
 * ============================================================
 * Locale configuration — 9th Round public site
 * ============================================================
 * The site ships in two languages under two URL trees:
 *
 *   /ar/...   Egyptian Arabic  (default — the club's home audience)
 *   /en/...   English
 *
 * `/` and any un-prefixed path are redirected to the default locale by
 * `middleware.ts`. Every page is statically generated once per locale, so
 * adding the second language costs nothing at request time.
 */

export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Egyptian audience first — `/` lands on Arabic. */
export const DEFAULT_LANG: Lang = "ar";

export function isLang(value: string | undefined | null): value is Lang {
  return value === "ar" || value === "en";
}

export function dir(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** `lang` attribute for <html>. */
export function htmlLang(lang: Lang): string {
  return lang === "ar" ? "ar-EG" : "en";
}

/** Open Graph locale tag. */
export function ogLocale(lang: Lang): string {
  return lang === "ar" ? "ar_EG" : "en_EG";
}

export function otherLang(lang: Lang): Lang {
  return lang === "ar" ? "en" : "ar";
}

/**
 * Prefixes an app-relative path with the locale segment.
 * `href("ar", "/programs")` -> `"/ar/programs"`, `href("en", "/")` -> `"/en"`.
 */
export function href(lang: Lang, path: string): string {
  if (!path.startsWith("/")) return path; // external / mailto / tel — untouched
  return `/${lang}${path === "/" ? "" : path}`;
}

/**
 * Strips the locale segment from a pathname, so the language switcher can
 * send the visitor to the same page in the other language.
 * `"/ar/programs/boxing"` -> `"/programs/boxing"`.
 */
export function stripLang(pathname: string): string {
  const m = /^\/(ar|en)(?=\/|$)/.exec(pathname);
  return m ? pathname.slice(m[0].length) || "/" : pathname;
}

/** A string that exists in both languages. Used for business data in site.config. */
export interface Localized {
  en: string;
  ar: string;
}

export function pick(value: Localized, lang: Lang): string {
  return value[lang];
}
