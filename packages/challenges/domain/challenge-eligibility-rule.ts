import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

/**
 * A closed set of rule types — never arbitrary executable code or
 * expressions. Per the approved MVP simplification, membership-based
 * eligibility (`active_membership`, `program_type`) and the old `branch`
 * rule are removed entirely: branch eligibility is now structural (the
 * challenge's scope plus the participant's own choice in
 * request_challenge_participation()), never a separate rule layered on
 * top, and there is no more membership record to check against at all.
 * Only age-based eligibility remains.
 */
export type ChallengeEligibilityRuleType = "min_age" | "max_age";

export interface ChallengeEligibilityRule {
  ruleId: string;
  challengeId: string;
  ruleType: ChallengeEligibilityRuleType;
  /** Shape depends on ruleType — see validateChallengeEligibilityRule. */
  value: Record<string, unknown>;
  createdAt: string;
}

const SUPPORTED_RULE_TYPES: ChallengeEligibilityRuleType[] = ["min_age", "max_age"];

/**
 * Rejects an unsupported rule_type and any rule whose value doesn't match
 * its type's fixed shape. This checks the rule's *syntactic* validity only
 * — a pure domain function with no database access (this repo's "no I/O in
 * the domain layer" convention). create_challenge()'s SQL re-checks the
 * same rule.
 */
export function validateChallengeEligibilityRule(ruleType: string, value: Record<string, unknown>): Result<void> {
  if (!SUPPORTED_RULE_TYPES.includes(ruleType as ChallengeEligibilityRuleType)) {
    return err(
      domainError(
        "UNSUPPORTED_ELIGIBILITY_RULE",
        `Unsupported eligibility rule type: ${ruleType}. Only min_age and max_age are supported.`,
      ),
    );
  }

  if (typeof value.age !== "number" || !Number.isInteger(value.age) || value.age < 0) {
    return err(domainError("INVALID_ELIGIBILITY_RULE", `A ${ruleType} rule requires a non-negative integer age.`));
  }
  return ok(undefined);
}

/**
 * The facts needed to evaluate eligibility, already fetched by the
 * infrastructure layer — this function itself never queries anything,
 * matching the domain layer's existing "pure business rules, no I/O"
 * convention throughout this monorepo. `ageYears` comes from
 * profiles.date_of_birth directly — no membership record is consulted.
 */
export interface ChallengeEligibilityContext {
  ageYears: number | null;
}

export interface ChallengeEligibilityDecision {
  eligible: boolean;
  reason: string | null;
}

function evaluateOneRule(rule: ChallengeEligibilityRule, context: ChallengeEligibilityContext): string | null {
  switch (rule.ruleType) {
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
  }
}

/** Evaluates every configured rule; a participant is eligible only if ALL rules pass. Returns the first failing reason, so they get one clear, actionable message rather than a dump of every unmet rule. */
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
