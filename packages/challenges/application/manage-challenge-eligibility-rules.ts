import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateChallengeEligibilityRule } from "../domain/challenge-eligibility-rule";
import type { ChallengeEligibilityRuleType } from "../domain/challenge-eligibility-rule";
import type { ChallengeRepository } from "../domain/challenge-repository";

export interface AddChallengeEligibilityRuleUseCaseInput {
  challengeId: string;
  ruleType: ChallengeEligibilityRuleType;
  age: number;
  /** The competition's other age rule, if any — lets the screen reject a min above the max without a round trip. */
  otherAge: number | null;
}

/**
 * Shape and min/max consistency are checked here so a mistake fails fast, but
 * the database re-checks all of it AND decides who may do this and whether
 * the competition is still before registration — those are never decided by
 * the caller or by this use case.
 */
export class AddChallengeEligibilityRuleUseCase
  implements UseCase<AddChallengeEligibilityRuleUseCaseInput, { ruleId: string }>
{
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(input: AddChallengeEligibilityRuleUseCaseInput): Promise<Result<{ ruleId: string }>> {
    const shape = validateChallengeEligibilityRule(input.ruleType, { age: input.age });
    if (shape.isErr) return shape;
    if (input.age > 120) {
      return err(domainError("INVALID_ELIGIBILITY_RULE", "Age must be between 0 and 120."));
    }
    if (input.otherAge !== null) {
      const min = input.ruleType === "min_age" ? input.age : input.otherAge;
      const max = input.ruleType === "max_age" ? input.age : input.otherAge;
      if (min > max) {
        return err(domainError("INVALID_ELIGIBILITY_RULE", "The minimum age cannot be greater than the maximum age."));
      }
    }
    return this.challenges.addEligibilityRule(input.challengeId, input.ruleType, input.age);
  }
}

export class RemoveChallengeEligibilityRuleUseCase implements UseCase<string, void> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(ruleId: string): Promise<Result<void>> {
    return this.challenges.removeEligibilityRule(ruleId);
  }
}
