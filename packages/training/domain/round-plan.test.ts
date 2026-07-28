import { describe, expect, it } from "vitest";
import { RoundPlan } from "./round-plan";

describe("RoundPlan", () => {
  it("creates a valid plan and computes total duration", () => {
    const result = RoundPlan.create({ rounds: 9, workSeconds: 180, restSeconds: 60 });
    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.totalDurationSeconds).toBe(9 * (180 + 60));
  });

  it("rejects a non-integer or out-of-range round count", () => {
    expect(RoundPlan.create({ rounds: 0, workSeconds: 180, restSeconds: 60 }).isErr).toBe(true);
    expect(RoundPlan.create({ rounds: 25, workSeconds: 180, restSeconds: 60 }).isErr).toBe(true);
    expect(RoundPlan.create({ rounds: 3.5, workSeconds: 180, restSeconds: 60 }).isErr).toBe(true);
  });

  it("rejects an out-of-range work interval", () => {
    const result = RoundPlan.create({ rounds: 9, workSeconds: 2, restSeconds: 60 });
    expect(result.isErr && result.error.code).toBe("INVALID_WORK_SECONDS");
  });

  it("rejects an out-of-range rest interval", () => {
    const result = RoundPlan.create({ rounds: 9, workSeconds: 180, restSeconds: 400 });
    expect(result.isErr && result.error.code).toBe("INVALID_REST_SECONDS");
  });

  it("allows zero rest (back-to-back rounds)", () => {
    const result = RoundPlan.create({ rounds: 5, workSeconds: 30, restSeconds: 0 });
    expect(result.isOk).toBe(true);
  });
});
