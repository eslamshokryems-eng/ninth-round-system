import { describe, expect, it } from "vitest";
import cases from "./parity-cases.json";
import { checkEligibility } from "./eligibility";
import type { PushupStyle, RaceCategoryCode, RaceGender } from "./eligibility";
import { normalizePhone } from "./phone";

// The same fixture is asserted against the SQL rules in
// supabase/tests/race/tests/11_parity.sql — the two implementations cannot drift apart.
describe("phone normalization parity cases", () => {
  it.each(cases.phone)("normalizes %j", ({ input, expect: expected }) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it("is idempotent", () => {
    for (const c of cases.phone) expect(normalizePhone(normalizePhone(c.input))).toBe(normalizePhone(c.input));
  });
});

describe("eligibility parity cases", () => {
  it.each(cases.eligibility.cases)("$name", (c) => {
    const result = checkEligibility({
      category: c.category as RaceCategoryCode,
      gender: c.gender as RaceGender,
      dateOfBirth: c.dateOfBirth,
      eventDate: cases.eligibility.eventDate,
      pushupStyle: c.pushupStyle as PushupStyle | null,
    });
    if (c.expect === "ok") expect(result.isOk).toBe(true);
    else expect(result.isErr && result.error.code).toBe(c.expect);
  });
});
