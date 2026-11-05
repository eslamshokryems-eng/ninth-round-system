import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANK_POINTS_POLICY,
  basePointsForRank,
  calculateEarnedPoints,
  canTransitionChallengeStatus,
  rankResults,
  validateChallengeScope,
  validateChallengeWeight,
} from "./challenge";

describe("validateChallengeWeight", () => {
  it("accepts an integer within the default 1-10 range", () => {
    expect(validateChallengeWeight(1).isOk).toBe(true);
    expect(validateChallengeWeight(10).isOk).toBe(true);
    expect(validateChallengeWeight(5).isOk).toBe(true);
  });

  it("rejects a value outside the configured range", () => {
    expect(validateChallengeWeight(0).isErr).toBe(true);
    expect(validateChallengeWeight(11).isErr).toBe(true);
  });

  it("rejects a non-integer weight", () => {
    expect(validateChallengeWeight(2.5).isErr).toBe(true);
  });

  it("validates against a custom configured range, not just the default", () => {
    expect(validateChallengeWeight(15, 1, 20).isOk).toBe(true);
    expect(validateChallengeWeight(15, 1, 10).isErr).toBe(true);
  });
});

describe("validateChallengeScope", () => {
  it("requires branchId to be null for an all-branches competition", () => {
    expect(validateChallengeScope("ALL_BRANCHES", null).isOk).toBe(true);
    expect(validateChallengeScope("ALL_BRANCHES", "branch-1").isErr).toBe(true);
  });

  it("requires a branchId for a branch competition", () => {
    expect(validateChallengeScope("BRANCH", "branch-1").isOk).toBe(true);
    expect(validateChallengeScope("BRANCH", null).isErr).toBe(true);
  });
});

describe("canTransitionChallengeStatus", () => {
  it("allows each sequential step in the lifecycle", () => {
    expect(canTransitionChallengeStatus("draft", "published")).toBe(true);
    expect(canTransitionChallengeStatus("published", "registration_open")).toBe(true);
    expect(canTransitionChallengeStatus("registration_open", "active")).toBe(true);
    expect(canTransitionChallengeStatus("active", "completed")).toBe(true);
    expect(canTransitionChallengeStatus("completed", "archived")).toBe(true);
  });

  it("rejects skipping a step", () => {
    expect(canTransitionChallengeStatus("draft", "active")).toBe(false);
  });

  it("rejects moving backward", () => {
    expect(canTransitionChallengeStatus("active", "published")).toBe(false);
  });
});

describe("basePointsForRank / calculateEarnedPoints", () => {
  it("matches the approved rank-points table for ranks 1-9", () => {
    expect(basePointsForRank(1)).toBe(100);
    expect(basePointsForRank(2)).toBe(90);
    expect(basePointsForRank(3)).toBe(80);
    expect(basePointsForRank(9)).toBe(50);
  });

  it("awards 40 points for any rank beyond 9", () => {
    expect(basePointsForRank(10)).toBe(40);
    expect(basePointsForRank(100)).toBe(40);
  });

  it("multiplies base rank points by the competition weight", () => {
    expect(calculateEarnedPoints(1, 1)).toBe(100);
    expect(calculateEarnedPoints(1, 3)).toBe(300);
    expect(calculateEarnedPoints(10, 2)).toBe(80);
  });
});

describe("rankResults", () => {
  it("ranks lower-is-better results ascending (e.g. a timed row)", () => {
    const ranked = rankResults(
      [
        { id: "a", value: 220 },
        { id: "b", value: 200 },
        { id: "c", value: 240 },
      ],
      "LOWER_IS_BETTER",
      1,
    );
    expect(ranked.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ranks higher-is-better results descending (e.g. a push-up count)", () => {
    const ranked = rankResults(
      [
        { id: "a", value: 30 },
        { id: "b", value: 45 },
        { id: "c", value: 20 },
      ],
      "HIGHER_IS_BETTER",
      1,
    );
    expect(ranked.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("applies competition ranking (1, 2, 2, 4) for tied results", () => {
    const ranked = rankResults(
      [
        { id: "a", value: 50 },
        { id: "b", value: 50 },
        { id: "c", value: 30 },
        { id: "d", value: 20 },
      ],
      "HIGHER_IS_BETTER",
      1,
    );
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.rank]));
    expect(byId).toEqual({ a: 1, b: 1, c: 3, d: 4 });
  });

  it("awards tied entries the same points, and applies the competition weight multiplier", () => {
    const ranked = rankResults(
      [
        { id: "a", value: 50 },
        { id: "b", value: 50 },
      ],
      "HIGHER_IS_BETTER",
      2,
      DEFAULT_RANK_POINTS_POLICY,
    );
    expect(ranked.find((r) => r.id === "a")?.points).toBe(200); // rank 1 = 100 base, weight 2
    expect(ranked.find((r) => r.id === "b")?.points).toBe(200);
  });

  it("never mutates the input array", () => {
    const entries = [
      { id: "a", value: 10 },
      { id: "b", value: 20 },
    ];
    rankResults(entries, "HIGHER_IS_BETTER", 1);
    expect(entries).toEqual([
      { id: "a", value: 10 },
      { id: "b", value: 20 },
    ]);
  });
});
