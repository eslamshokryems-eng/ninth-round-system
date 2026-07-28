import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { createI18nInstance, DEFAULT_LOCALE } from "@9thround/i18n";
import { useLocaleStore } from "../lib/locale-store";

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((state) => state.locale) ?? DEFAULT_LOCALE;

  // Re-created only when the locale actually changes, not on every render —
  // recreating an i18next instance is not free.
  const i18n = useMemo(() => createI18nInstance({ locale }), [locale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
