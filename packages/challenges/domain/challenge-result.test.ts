import { describe, expect, it } from "vitest";
import { isCurrentChallengeResult, type ChallengeResult } from "./challenge-result";

function buildResult(overrides: Partial<ChallengeResult> = {}): ChallengeResult {
  return {
    resultId: "result-1",
    challengeId: "challenge-1",
    participantProfileId: "profile-1",
    enteredByProfileId: "coach-1",
    resultValue: 42,
    normalizedResultValue: null,
    measurementUnit: "reps",
    performedAt: "2026-01-01T00:00:00.000Z",
    status: "approved",
    correctsResultId: null,
    supersededByResultId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isCurrentChallengeResult", () => {
  it("is current when approved and not superseded", () => {
    expect(isCurrentChallengeResult(buildResult())).toBe(true);
  });

  it("is not current once superseded by a later correction, even though it stays approved", () => {
    expect(isCurrentChallengeResult(buildResult({ supersededByResultId: "result-2" }))).toBe(false);
  });

  it("is not current while pending, rejected, or awaiting a correction decision", () => {
    expect(isCurrentChallengeResult(buildResult({ status: "pending" }))).toBe(false);
    expect(isCurrentChallengeResult(buildResult({ status: "rejected" }))).toBe(false);
    expect(isCurrentChallengeResult(buildResult({ status: "correction_pending" }))).toBe(false);
  });
});
