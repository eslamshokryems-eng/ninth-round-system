import type { Result } from "@9thround/shared-kernel";
import type { ChallengeLeaderboardEntry, SeasonLeaderboardEntry } from "./challenge-queries";

/**
 * The public-facing standings.
 *
 * These are the only read path that serves one customer's performance to
 * another. They are backed by the three leaderboard views, which run with
 * the view owner's rights and project exactly four things — display name,
 * branch, value and rank — so none of the private columns on
 * challenge_participants or challenge_results can travel with them. The
 * views also carry their own `auth_role() is not null` gate, which is what
 * keeps anonymous callers and deactivated staff out.
 */
export interface ChallengeLeaderboardRepository {
  /** One competition's standings, ranked (ties share a rank). */
  forChallenge(challengeId: string): Promise<Result<ChallengeLeaderboardEntry[]>>;
  /** A season's cumulative standings across every competition in it. */
  forSeasonOverall(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>>;
  /** The same season board split by the branch each participant competed for. */
  forSeasonByBranch(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>>;
}
