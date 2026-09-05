"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries, type Dictionary, type Locale } from "./dictionary";

interface LanguageContextValue {
  locale: Locale;
  dict: Dictionary;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "9thround-site-locale";

/**
 * English-primary per instruction, with an Arabic toggle — no routing
 * split (/en, /ar), just client-side state persisted to localStorage.
 * The server-rendered shell is always English (matches what a crawler
 * sees); after hydration this reads the stored preference and, if it's
 * Arabic, updates <html lang/dir> imperatively — the standard pattern
 * for a client-toggled locale without dedicated i18n routing.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private browsing etc.) — locale still works for this page view.
    }
  }

  const value: LanguageContextValue = {
    locale,
    dict: dictionaries[locale],
    dir: locale === "ar" ? "rtl" : "ltr",
    setLocale,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
