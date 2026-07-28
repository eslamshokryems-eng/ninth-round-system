import { describe, expect, it } from "vitest";
import { BodyMetrics, ageFromDateOfBirth, dateOfBirthFromAge } from "./body-metrics";

describe("dateOfBirthFromAge / ageFromDateOfBirth round trip", () => {
  it("recovers the same age from a converted date of birth", () => {
    const now = new Date(Date.UTC(2026, 6, 28)); // 2026-07-28
    const dob = dateOfBirthFromAge(28, now);
    expect(ageFromDateOfBirth(dob, now)).toBe(28);
  });

  it("does not count a birthday that hasn't happened yet this year", () => {
    const dob = new Date(Date.UTC(2000, 11, 31)); // Dec 31, 2000
    const now = new Date(Date.UTC(2026, 0, 1)); // Jan 1, 2026 — birthday not yet reached
    expect(ageFromDateOfBirth(dob, now)).toBe(25);
  });

  it("counts a birthday that already happened this year", () => {
    const dob = new Date(Date.UTC(2000, 0, 1));
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(ageFromDateOfBirth(dob, now)).toBe(26);
  });
});

describe("BodyMetrics.create", () => {
  const validInput = {
    gender: "female" as const,
    dateOfBirth: dateOfBirthFromAge(28, new Date(Date.UTC(2026, 6, 28))),
    heightCm: 165,
    weightKg: 62,
  };

  it("creates a valid BodyMetrics and exposes its computed age", () => {
    const result = BodyMetrics.create(validInput);
    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.age).toBe(28);
    expect(result.isOk && result.value.heightCm).toBe(165);
  });

  it("rejects an age outside 13-100", () => {
    const tooYoung = BodyMetrics.create({ ...validInput, dateOfBirth: dateOfBirthFromAge(5) });
    expect(tooYoung.isErr && tooYoung.error.code).toBe("INVALID_AGE");

    const tooOld = BodyMetrics.create({ ...validInput, dateOfBirth: dateOfBirthFromAge(150) });
    expect(tooOld.isErr && tooOld.error.code).toBe("INVALID_AGE");
  });

  it("rejects an out-of-range height", () => {
    const result = BodyMetrics.create({ ...validInput, heightCm: 40 });
    expect(result.isErr && result.error.code).toBe("INVALID_HEIGHT");
  });

  it("rejects an out-of-range weight", () => {
    const result = BodyMetrics.create({ ...validInput, weightKg: 500 });
    expect(result.isErr && result.error.code).toBe("INVALID_WEIGHT");
  });
});
