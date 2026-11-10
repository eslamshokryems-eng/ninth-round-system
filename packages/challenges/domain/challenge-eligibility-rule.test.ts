import { describe, expect, it } from "vitest";
import {
  evaluateChallengeEligibility,
  validateChallengeEligibilityRule,
  type ChallengeEligibilityContext,
  type ChallengeEligibilityRule,
} from "./challenge-eligibility-rule";

describe("validateChallengeEligibilityRule", () => {
  it("rejects an unsupported rule type safely, without throwing", () => {
    expect(validateChallengeEligibilityRule("has_tattoo", {}).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("active_membership", {}).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("program_type", { programType: "boxing" }).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("branch", { branchId: "11111111-1111-1111-1111-111111111111" }).isErr).toBe(true);
  });

  it("requires a non-negative integer age for min_age/max_age rules", () => {
    expect(validateChallengeEligibilityRule("min_age", { age: -1 }).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("min_age", { age: 1.5 }).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("min_age", { age: 16 }).isOk).toBe(true);
    expect(validateChallengeEligibilityRule("max_age", { age: 60 }).isOk).toBe(true);
  });
});

function rule(ruleType: ChallengeEligibilityRule["ruleType"], value: Record<string, unknown> = {}): ChallengeEligibilityRule {
  return { ruleId: "rule-1", challengeId: "challenge-1", ruleType, value, createdAt: "2026-01-01T00:00:00.000Z" };
}

const baseContext: ChallengeEligibilityContext = {
  ageYears: 25,
};

describe("evaluateChallengeEligibility", () => {
  it("is eligible when all configured rules pass", () => {
    const decision = evaluateChallengeEligibility([rule("min_age", { age: 18 }), rule("max_age", { age: 40 })], baseContext);
    expect(decision).toEqual({ eligible: true, reason: null });
  });

  it("rejects when below the minimum age", () => {
    const decision = evaluateChallengeEligibility([rule("min_age", { age: 30 })], baseContext);
    expect(decision.eligible).toBe(false);
  });

  it("rejects when above the maximum age", () => {
    const decision = evaluateChallengeEligibility([rule("max_age", { age: 18 })], baseContext);
    expect(decision.eligible).toBe(false);
  });

  it("rejects age rules when date of birth is unknown", () => {
    const decision = evaluateChallengeEligibility([rule("min_age", { age: 16 })], { ageYears: null });
    expect(decision.eligible).toBe(false);
  });

  it("is eligible with no configured rules at all", () => {
    expect(evaluateChallengeEligibility([], baseContext)).toEqual({ eligible: true, reason: null });
  });
});
