import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateChallengeScope, validateChallengeWeight } from "../domain/challenge";
import { validateChallengeEligibilityRule } from "../domain/challenge-eligibility-rule";
import type { ChallengeRepository, CreateChallengeInput } from "../domain/challenge-repository";

export interface CreateChallengeUseCaseInput extends CreateChallengeInput {
  /** The currently-configured weight range (challenge_settings), supplied by the caller — this use case does not read settings itself (see challenge-settings-repository.ts's doc comment). */
  weightRange: { min: number; max: number };
}

/** Branch Manager creates within their own branch; Super Admin can create any scope — enforced server-side by create_challenge(), not here. This use case's checks are defense-in-depth client validation, same "client validates too, the DB is still the real gate" pattern used throughout this codebase (e.g. SellAdditionalMembershipUseCase). */
export class CreateChallengeUseCase implements UseCase<CreateChallengeUseCaseInput, { challengeId: string }> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(input: CreateChallengeUseCaseInput): Promise<Result<{ challengeId: string }>> {
    const weightResult = validateChallengeWeight(input.weight, input.weightRange.min, input.weightRange.max);
    if (weightResult.isErr) return weightResult;

    const scopeResult = validateChallengeScope(input.scope, input.branchId, input.branchIds);
    if (scopeResult.isErr) return scopeResult;

    for (const rule of input.eligibilityRules) {
      const ruleResult = validateChallengeEligibilityRule(rule.ruleType, rule.value);
      if (ruleResult.isErr) return ruleResult;
    }

    return this.challenges.create(input);
  }
}
