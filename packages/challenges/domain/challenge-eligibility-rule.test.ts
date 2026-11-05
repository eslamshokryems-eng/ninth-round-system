import { describe, expect, it } from "vitest";
import {
  evaluateChallengeEligibility,
  validateChallengeEligibilityRule,
  type ChallengeEligibilityContext,
  type ChallengeEligibilityRule,
} from "./challenge-eligibility-rule";

describe("validateChallengeEligibilityRule", () => {
  it("rejects an unsupported rule type safely, without throwing", () => {
    const result = validateChallengeEligibilityRule("has_tattoo", {});
    expect(result.isErr).toBe(true);
  });

  it("accepts active_membership with no parameters", () => {
    expect(validateChallengeEligibilityRule("active_membership", {}).isOk).toBe(true);
  });

  it("requires a programType value for a program_type rule", () => {
    expect(validateChallengeEligibilityRule("program_type", {}).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("program_type", { programType: "boxing" }).isOk).toBe(true);
  });

  it("requires a non-negative integer age for min_age/max_age rules", () => {
    expect(validateChallengeEligibilityRule("min_age", { age: -1 }).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("min_age", { age: 1.5 }).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("min_age", { age: 16 }).isOk).toBe(true);
  });

  it("requires a branchId for a branch rule", () => {
    expect(validateChallengeEligibilityRule("branch", {}).isErr).toBe(true);
    expect(validateChallengeEligibilityRule("branch", { branchId: "branch-1" }).isOk).toBe(true);
  });
});

function rule(ruleType: ChallengeEligibilityRule["ruleType"], value: Record<string, unknown> = {}): ChallengeEligibilityRule {
  return { ruleId: "rule-1", challengeId: "challenge-1", ruleType, value, createdAt: "2026-01-01T00:00:00.000Z" };
}

const baseContext: ChallengeEligibilityContext = {
  hasActiveMembership: true,
  activeProgramTypes: ["boxing"],
  ageYears: 25,
  branchId: "branch-1",
};

describe("evaluateChallengeEligibility", () => {
  it("is eligible when all configured rules pass", () => {
    const decision = evaluateChallengeEligibility([rule("active_membership"), rule("program_type", { programType: "boxing" })], baseContext);
    expect(decision).toEqual({ eligible: true, reason: null });
  });

  it("rejects with a clear reason when active_membership fails", () => {
    const decision = evaluateChallengeEligibility([rule("active_membership")], { ...baseContext, hasActiveMembership: false });
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toContain("active membership");
  });

  it("rejects when the member lacks the required program type", () => {
    const decision = evaluateChallengeEligibility([rule("program_type", { programType: "mma" })], baseContext);
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toContain("mma");
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
    const decision = evaluateChallengeEligibility([rule("min_age", { age: 16 })], { ...baseContext, ageYears: null });
    expect(decision.eligible).toBe(false);
  });

  it("rejects when the member isn't in the required branch", () => {
    const decision = evaluateChallengeEligibility([rule("branch", { branchId: "branch-2" })], baseContext);
    expect(decision.eligible).toBe(false);
  });

  it("is eligible with no configured rules at all", () => {
    expect(evaluateChallengeEligibility([], baseContext)).toEqual({ eligible: true, reason: null });
  });
});
