import { describe, expect, it } from "vitest";
import { validateCoachDesignationReason, validateIsDesignatedCoach } from "./challenge-coach-assignment";

describe("validateCoachDesignationReason", () => {
  it("rejects an empty or whitespace-only reason", () => {
    expect(validateCoachDesignationReason("").isErr).toBe(true);
    expect(validateCoachDesignationReason("   ").isErr).toBe(true);
  });

  it("accepts any non-empty reason", () => {
    expect(validateCoachDesignationReason("Only coach at this branch.").isOk).toBe(true);
  });
});

describe("validateIsDesignatedCoach", () => {
  it("blocks when no coach has been designated yet", () => {
    const result = validateIsDesignatedCoach(null, "coach-1");
    expect(result.isErr).toBe(true);
  });

  it("blocks when the caller isn't the designated coach", () => {
    const result = validateIsDesignatedCoach("coach-1", "coach-2");
    expect(result.isErr).toBe(true);
  });

  it("allows the designated coach", () => {
    const result = validateIsDesignatedCoach("coach-1", "coach-1");
    expect(result.isOk).toBe(true);
  });
});
