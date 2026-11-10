import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeSettingsRepository } from "../domain/challenge-settings-repository";

export interface SetChallengeWeightRangeInput {
  min: number;
  max: number;
}

/** Super Admin only — spec §2.3. Changing the configured range never rewrites any existing challenge's already-chosen weight (that validation only ever happens at creation time). */
export class SetChallengeWeightRangeUseCase implements UseCase<SetChallengeWeightRangeInput, void> {
  constructor(private readonly settings: ChallengeSettingsRepository) {}

  async execute(input: SetChallengeWeightRangeInput): Promise<Result<void>> {
    if (!Number.isInteger(input.min) || !Number.isInteger(input.max)) {
      return err(domainError("INVALID_WEIGHT_RANGE", "The weight range must use whole numbers."));
    }
    if (input.min < 1 || input.max < input.min) {
      return err(domainError("INVALID_WEIGHT_RANGE", "The minimum weight must be at least 1 and no greater than the maximum."));
    }
    return this.settings.setWeightRange(input.min, input.max);
  }
}
