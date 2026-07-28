import { describe, expect, it } from "vitest";
import { createI18nInstance, resources } from "./config";

describe("i18n config", () => {
  it("has matching key sets for every supported locale (no missing translations)", () => {
    const flatten = (obj: unknown, prefix = ""): string[] =>
      Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "object" && value !== null
          ? flatten(value, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );

    const enKeys = flatten(resources.en.translation).sort();
    const arKeys = flatten(resources.ar.translation).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("resolves a key in the requested locale", () => {
    const i18n = createI18nInstance({ locale: "ar" });
    expect(i18n.t("auth.logIn.submit")).toBe("تسجيل الدخول");
  });

  it("falls back to English for an unresolvable key", () => {
    const i18n = createI18nInstance({ locale: "en" });
    expect(i18n.t("auth.logIn.submit")).toBe("Log in");
  });
});
