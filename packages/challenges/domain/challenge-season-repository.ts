import type { Result } from "@9thround/shared-kernel";
import type { ChallengeSeason, CreateChallengeSeasonInput } from "./challenge-season";

export interface ChallengeSeasonRepository {
  create(input: CreateChallengeSeasonInput): Promise<Result<{ seasonId: string }>>;
  /** Seasons the caller may see (any active profile), newest first — backs the season picker on the create form. */
  list(): Promise<Result<ChallengeSeason[]>>;
}
