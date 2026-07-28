import i18next, { type i18n as I18nInstance } from "i18next";
import type { LocaleCode } from "@9thround/shared-kernel";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

/**
 * One i18next resource bundle shared by both apps/mobile (via react-i18next)
 * and apps/web (via react-i18next, client-side) — a single translation
 * library and a single set of resource files, per docs/11-internationalization.md.
 * Adding a screen's strings here makes them available to both apps at once.
 */
export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const satisfies Record<LocaleCode, { translation: unknown }>;

export interface CreateI18nOptions {
  locale: LocaleCode;
}

/**
 * Each app creates its own i18next instance at startup (mobile: on app boot
 * from the persisted/onboarding-selected locale; web: per-request or on
 * locale-cookie change) rather than sharing a singleton, since the two apps
 * have different lifecycle/hydration needs.
 */
export function createI18nInstance({ locale }: CreateI18nOptions): I18nInstance {
  const instance = i18next.createInstance();
  void instance.init({
    resources,
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
