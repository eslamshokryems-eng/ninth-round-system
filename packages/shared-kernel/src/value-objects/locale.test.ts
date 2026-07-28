import { describe, expect, it } from "vitest";
import { isRtl, isSupportedLocale, textDirection, translate } from "./locale";

describe("Locale value object", () => {
  it("recognizes exactly the two launch locales", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("ar")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("flags Arabic as RTL and English as LTR", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(textDirection("ar")).toBe("rtl");
    expect(textDirection("en")).toBe("ltr");
  });

  it("translate() falls back to English when a locale is missing", () => {
    expect(translate({ en: "Boxer's Shuffle", ar: "خطوة الملاكم" }, "ar")).toBe("خطوة الملاكم");
    expect(translate({ en: "Boxer's Shuffle" }, "ar")).toBe("Boxer's Shuffle");
  });
});
