import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeLeaderboardEntry, SeasonLeaderboardEntry } from "../domain/challenge-queries";
import type { ChallengeLeaderboardRepository } from "../domain/challenge-leaderboard-repository";

/** One competition's public standings. */
export class GetChallengeLeaderboardUseCase implements UseCase<string, ChallengeLeaderboardEntry[]> {
  constructor(private readonly leaderboard: ChallengeLeaderboardRepository) {}

  async execute(challengeId: string): Promise<Result<ChallengeLeaderboardEntry[]>> {
    return this.leaderboard.forChallenge(challengeId);
  }
}

/** A season's cumulative standings. */
export class GetSeasonLeaderboardUseCase implements UseCase<string, SeasonLeaderboardEntry[]> {
  constructor(private readonly leaderboard: ChallengeLeaderboardRepository) {}

  async execute(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>> {
    return this.leaderboard.forSeasonOverall(seasonId);
  }
}

/** The same season standings split by the branch each participant competed for. */
export class GetSeasonLeaderboardByBranchUseCase implements UseCase<string, SeasonLeaderboardEntry[]> {
  constructor(private readonly leaderboard: ChallengeLeaderboardRepository) {}

  async execute(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>> {
    return this.leaderboard.forSeasonByBranch(seasonId);
  }
}
