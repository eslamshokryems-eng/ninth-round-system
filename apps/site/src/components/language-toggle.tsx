"use client";

import { useLanguage } from "../i18n/language-provider";

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
      className="rounded-pill border border-grey/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-bone transition-colors hover:border-red"
      aria-label="Switch language"
    >
      {locale === "en" ? "AR" : "EN"}
    </button>
  );
}
