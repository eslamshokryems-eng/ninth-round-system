import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeSeason } from "../domain/challenge-season";
import type { ChallengeSeasonRepository } from "../domain/challenge-season-repository";
import type { ChallengeSettingsRepository } from "../domain/challenge-settings-repository";

/** Season picker on the create form. */
export class ListChallengeSeasonsUseCase implements UseCase<void, ChallengeSeason[]> {
  constructor(private readonly seasons: ChallengeSeasonRepository) {}

  async execute(): Promise<Result<ChallengeSeason[]>> {
    return this.seasons.list();
  }
}

/** The configured weight range, for the create form's hint and client-side bounds check. */
export class GetChallengeWeightRangeUseCase implements UseCase<void, { min: number; max: number }> {
  constructor(private readonly settings: ChallengeSettingsRepository) {}

  async execute(): Promise<Result<{ min: number; max: number }>> {
    return this.settings.getWeightRange();
  }
}
