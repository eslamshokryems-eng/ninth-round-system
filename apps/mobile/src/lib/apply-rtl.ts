import { I18nManager } from "react-native";
import { isRtl, type LocaleCode } from "@9thround/shared-kernel";

/**
 * `I18nManager.forceRTL` only takes visual effect after the native layer
 * restarts (docs/11-internationalization.md §11.6) — this function applies
 * the flag and reports whether anything actually changed, so the caller
 * (the language-picker screen) knows whether to show a "restart to apply"
 * notice or not.
 */
export function applyRtlForLocale(locale: LocaleCode): boolean {
  const shouldBeRtl = isRtl(locale);
  if (I18nManager.isRTL === shouldBeRtl) return false;

  I18nManager.allowRTL(true);
  I18nManager.forceRTL(shouldBeRtl);
  return true;
}
