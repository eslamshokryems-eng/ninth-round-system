import { describe, expect, it } from "vitest";
import type { RegisterAthleteInput } from "./registration";
import { validateRegistration } from "./registration-validation";

function input(overrides: Partial<RegisterAthleteInput> = {}): RegisterAthleteInput {
  return {
    eventId: "event-1",
    eventDate: "2026-11-20",
    fullName: "Ahmed Mohamed",
    phone: "0100 123 4567",
    email: null,
    gender: "male",
    dateOfBirth: "1995-05-05",
    category: "MEN",
    pushupStyle: null,
    waiverAccepted: true,
    emergencyContact: { name: "Mother", phone: "01011112222" },
    ...overrides,
  };
}

const code = (r: ReturnType<typeof validateRegistration>) => (r.isErr ? r.error.code : "ok");

describe("validateRegistration", () => {
  it("accepts a valid registration", () => {
    expect(code(validateRegistration(input()))).toBe("ok");
  });
  it("accepts Arabic-Indic digits in phones", () => {
    expect(code(validateRegistration(input({ phone: "٠١٠٠١٢٣٤٥٦٧", emergencyContact: { name: "أم", phone: "٠١٠١١١١٢٢٢٢" } })))).toBe("ok");
  });
  it.each([
    ["short name", { fullName: "A" }, "RACE_INVALID_NAME"],
    ["blank name", { fullName: "   " }, "RACE_INVALID_NAME"],
    ["bad phone", { phone: "12345" }, "RACE_INVALID_PHONE"],
    ["bad email", { email: "nope" }, "RACE_INVALID_EMAIL"],
    ["no waiver", { waiverAccepted: false }, "RACE_WAIVER_REQUIRED"],
    ["no emergency name", { emergencyContact: { name: " ", phone: "01011112222" } }, "RACE_EMERGENCY_CONTACT_REQUIRED"],
    ["bad emergency phone", { emergencyContact: { name: "X", phone: "123" } }, "RACE_EMERGENCY_CONTACT_REQUIRED"],
    ["woman in men", { gender: "female" as const }, "RACE_CATEGORY_GENDER"],
    ["young masters", { category: "MASTERS" as const, dateOfBirth: "1990-01-01" }, "RACE_CATEGORY_AGE"],
  ])("%s → %s", (_name, overrides, expected) => {
    expect(code(validateRegistration(input(overrides)))).toBe(expected);
  });
  it("accepts an empty-string email as 'no email'", () => {
    expect(code(validateRegistration(input({ email: "  " })))).toBe("ok");
  });
  it("checks in the same order as the database (name before phone before waiver)", () => {
    expect(code(validateRegistration(input({ fullName: "", phone: "1", waiverAccepted: false })))).toBe("RACE_INVALID_NAME");
    expect(code(validateRegistration(input({ phone: "1", waiverAccepted: false })))).toBe("RACE_INVALID_PHONE");
    expect(code(validateRegistration(input({ waiverAccepted: false, gender: "female" })))).toBe("RACE_WAIVER_REQUIRED");
  });
});
