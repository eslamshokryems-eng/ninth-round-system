import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { ChallengeProgramType } from "./challenge";

/**
 * A closed set of rule types (spec §2.6/§5.4) — never arbitrary executable
 * code or expressions. Each type's `value` shape is fixed and validated
 * below, so an eligibility rule can only ever express one of these
 * explicitly-supported checks.
 */
export type ChallengeEligibilityRuleType = "active_membership" | "program_type" | "min_age" | "max_age" | "branch";

export interface ChallengeEligibilityRule {
  ruleId: string;
  challengeId: string;
  ruleType: ChallengeEligibilityRuleType;
  /** Shape depends on ruleType — see validateChallengeEligibilityRule. */
  value: Record<string, unknown>;
  createdAt: string;
}

const SUPPORTED_RULE_TYPES: ChallengeEligibilityRuleType[] = ["active_membership", "program_type", "min_age", "max_age", "branch"];

/** Rejects an unsupported rule_type and any rule whose value doesn't match its type's fixed shape — spec §13.3's "unsupported eligibility rule types are rejected safely". */
export function validateChallengeEligibilityRule(ruleType: string, value: Record<string, unknown>): Result<void> {
  if (!SUPPORTED_RULE_TYPES.includes(ruleType as ChallengeEligibilityRuleType)) {
    return err(domainError("UNSUPPORTED_ELIGIBILITY_RULE", `Unsupported eligibility rule type: ${ruleType}.`));
  }

  switch (ruleType as ChallengeEligibilityRuleType) {
    case "active_membership":
      return ok(undefined); // no parameters — presence of the rule is the whole check
    case "program_type":
      if (typeof value.programType !== "string") {
        return err(domainError("INVALID_ELIGIBILITY_RULE", "A program_type rule requires a programType value."));
      }
      return ok(undefined);
    case "min_age":
    case "max_age":
      if (typeof value.age !== "number" || !Number.isInteger(value.age) || value.age < 0) {
        return err(domainError("INVALID_ELIGIBILITY_RULE", `A ${ruleType} rule requires a non-negative integer age.`));
      }
      return ok(undefined);
    case "branch":
      if (typeof value.branchId !== "string" || value.branchId.length === 0) {
        return err(domainError("INVALID_ELIGIBILITY_RULE", "A branch rule requires a branchId."));
      }
      return ok(undefined);
  }
}

/**
 * The facts needed to evaluate eligibility, already fetched by the
 * infrastructure layer (Phase 2) — this function itself never queries
 * anything, matching the domain layer's existing "pure business rules, no
 * I/O" convention throughout this monorepo.
 */
export interface ChallengeEligibilityContext {
  hasActiveMembership: boolean;
  activeProgramTypes: ChallengeProgramType[];
  ageYears: number | null;
  branchId: string | null;
}

export interface ChallengeEligibilityDecision {
  eligible: boolean;
  reason: string | null;
}

function evaluateOneRule(rule: ChallengeEligibilityRule, context: ChallengeEligibilityContext): string | null {
  switch (rule.ruleType) {
    case "active_membership":
      return context.hasActiveMembership ? null : "Requires an active membership.";
    case "program_type": {
      const required = rule.value.programType as ChallengeProgramType;
      return context.activeProgramTypes.includes(required) ? null : `Requires an active ${required} membership.`;
    }
    case "min_age": {
      const min = rule.value.age as number;
      if (context.ageYears === null) return "Date of birth is required to check age eligibility.";
      return context.ageYears >= min ? null : `Minimum age is ${min}.`;
    }
    case "max_age": {
      const max = rule.value.age as number;
      if (context.ageYears === null) return "Date of birth is required to check age eligibility.";
      return context.ageYears <= max ? null : `Maximum age is ${max}.`;
    }
    case "branch": {
      const required = rule.value.branchId as string;
      return context.branchId === required ? null : "Not a member of the required branch.";
    }
  }
}

/** Evaluates every configured rule; a member is eligible only if ALL rules pass. Returns the first failing reason, so the member gets one clear, actionable message rather than a dump of every unmet rule. */
export function evaluateChallengeEligibility(
  rules: ChallengeEligibilityRule[],
  context: ChallengeEligibilityContext,
): ChallengeEligibilityDecision {
  for (const rule of rules) {
    const failureReason = evaluateOneRule(rule, context);
    if (failureReason) {
      return { eligible: false, reason: failureReason };
    }
  }
  return { eligible: true, reason: null };
}
