import { describe, expect, it } from "vitest";
import { validateChallengeSeasonDates } from "./challenge-season";

describe("validateChallengeSeasonDates", () => {
  it("accepts a valid date range", () => {
    const result = validateChallengeSeasonDates("2026-01-01", "2026-03-01");
    expect(result.isOk).toBe(true);
  });

  it("rejects an end date on or before the start date", () => {
    expect(validateChallengeSeasonDates("2026-03-01", "2026-01-01").isErr).toBe(true);
    expect(validateChallengeSeasonDates("2026-01-01", "2026-01-01").isErr).toBe(true);
  });

  it("rejects an invalid date string", () => {
    expect(validateChallengeSeasonDates("not-a-date", "2026-03-01").isErr).toBe(true);
  });
});
