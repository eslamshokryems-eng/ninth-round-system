import { describe, expect, it } from "vitest";
import { ageOnDate, allowedPushupStyles, checkEligibility, defaultPushupStyle } from "./eligibility";

describe("ageOnDate", () => {
  it("is birthday-exact", () => {
    expect(ageOnDate("1986-11-20", "2026-11-20")).toBe(40);
    expect(ageOnDate("1986-11-21", "2026-11-20")).toBe(39);
    expect(ageOnDate("1986-11-19", "2026-11-20")).toBe(40);
  });
  it("handles leap-day birthdays like Postgres age()", () => {
    expect(ageOnDate("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOnDate("2000-02-29", "2026-03-01")).toBe(26);
  });
  it("returns null for impossible or malformed dates", () => {
    expect(ageOnDate("2001-02-29", "2026-11-20")).toBeNull();
    expect(ageOnDate("not-a-date", "2026-11-20")).toBeNull();
    expect(ageOnDate("1990-13-01", "2026-11-20")).toBeNull();
  });
});

describe("push-up styles", () => {
  it("defaults: Men Standard, Women Knee, Masters Knee", () => {
    expect(defaultPushupStyle("MEN")).toBe("STANDARD");
    expect(defaultPushupStyle("WOMEN")).toBe("KNEE");
    expect(defaultPushupStyle("MASTERS")).toBe("KNEE");
  });
  it("any athlete may choose Knee; Standard only where it is the default", () => {
    expect(allowedPushupStyles("MEN")).toEqual(["STANDARD", "KNEE"]);
    expect(allowedPushupStyles("WOMEN")).toEqual(["KNEE"]);
    expect(allowedPushupStyles("MASTERS")).toEqual(["KNEE"]);
  });
  it("returns the style the registration will get", () => {
    const result = checkEligibility({ category: "WOMEN", gender: "female", dateOfBirth: null, eventDate: "2026-11-20", pushupStyle: null });
    expect(result.isOk && result.value.pushupStyle).toBe("KNEE");
  });
});

describe("checkEligibility on malformed input", () => {
  it("rejects an unparseable date of birth", () => {
    const result = checkEligibility({ category: "MEN", gender: "male", dateOfBirth: "31/12/1990", eventDate: "2026-11-20", pushupStyle: null });
    expect(result.isErr && result.error.code).toBe("RACE_INVALID_DOB");
  });
});
