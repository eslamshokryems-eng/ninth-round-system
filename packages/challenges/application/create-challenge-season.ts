import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateChallengeSeasonDates } from "../domain/challenge-season";
import type { CreateChallengeSeasonInput } from "../domain/challenge-season";
import type { ChallengeSeasonRepository } from "../domain/challenge-season-repository";

/** Super Admin only (spec §2.4: "created manually by administration") — the real gate is the create_challenge_season() RPC's own check, not this use case. */
export class CreateChallengeSeasonUseCase implements UseCase<CreateChallengeSeasonInput, { seasonId: string }> {
  constructor(private readonly seasons: ChallengeSeasonRepository) {}

  async execute(input: CreateChallengeSeasonInput): Promise<Result<{ seasonId: string }>> {
    const validation = validateChallengeSeasonDates(input.startsAt, input.endsAt);
    if (validation.isErr) return validation;

    return this.seasons.create(input);
  }
}
