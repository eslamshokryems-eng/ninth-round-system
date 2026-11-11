import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ChallengeLeaderboardRepository } from "../domain/challenge-leaderboard-repository";
import type { ChallengeLeaderboardEntry, SeasonLeaderboardEntry } from "../domain/challenge-queries";

/**
 * Reads the three leaderboard views.
 *
 * Nothing is filtered or re-ranked here. The views already do the ranking
 * (competition ranking, so ties share a place and the next place is
 * skipped) and already carry the `auth_role() is not null` gate that keeps
 * anonymous callers and deactivated staff out. Re-sorting or re-numbering
 * in the client would be a second, divergent copy of a rule the database
 * owns — so this maps columns and nothing else.
 */
export class SupabaseChallengeLeaderboardRepository implements ChallengeLeaderboardRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async forChallenge(challengeId: string): Promise<Result<ChallengeLeaderboardEntry[]>> {
    const { data, error } = await this.client
      .from("challenge_leaderboard")
      .select("result_id, challenge_id, participant_profile_id, branch_id, display_name, result_value, overall_rank, branch_rank")
      .eq("challenge_id", challengeId)
      .order("overall_rank", { ascending: true });

    if (error) {
      return err(domainError("CHALLENGE_LEADERBOARD_FAILED", error.message));
    }

    const rows = (data ?? []) as {
      result_id: string;
      challenge_id: string;
      participant_profile_id: string;
      branch_id: string | null;
      display_name: string;
      result_value: number;
      overall_rank: number;
      branch_rank: number;
    }[];

    return ok(
      rows.map((row) => ({
        resultId: row.result_id,
        challengeId: row.challenge_id,
        participantProfileId: row.participant_profile_id,
        branchId: row.branch_id,
        displayName: row.display_name,
        resultValue: Number(row.result_value),
        overallRank: Number(row.overall_rank),
        branchRank: Number(row.branch_rank),
      })),
    );
  }

  async forSeasonOverall(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>> {
    const { data, error } = await this.client
      .from("challenge_season_leaderboard_overall")
      .select("season_id, participant_profile_id, display_name, total_points, rank")
      .eq("season_id", seasonId)
      .order("rank", { ascending: true });

    if (error) {
      return err(domainError("SEASON_LEADERBOARD_FAILED", error.message));
    }

    const rows = (data ?? []) as {
      season_id: string;
      participant_profile_id: string;
      display_name: string;
      total_points: number;
      rank: number;
    }[];

    return ok(
      rows.map((row) => ({
        seasonId: row.season_id,
        participantProfileId: row.participant_profile_id,
        displayName: row.display_name,
        totalPoints: Number(row.total_points),
        rank: Number(row.rank),
      })),
    );
  }

  async forSeasonByBranch(seasonId: string): Promise<Result<SeasonLeaderboardEntry[]>> {
    const { data, error } = await this.client
      .from("challenge_season_leaderboard_by_branch")
      .select("season_id, branch_id, participant_profile_id, display_name, total_points, rank")
      .eq("season_id", seasonId)
      .order("rank", { ascending: true });

    if (error) {
      return err(domainError("SEASON_LEADERBOARD_FAILED", error.message));
    }

    const rows = (data ?? []) as {
      season_id: string;
      branch_id: string | null;
      participant_profile_id: string;
      display_name: string;
      total_points: number;
      rank: number;
    }[];

    return ok(
      rows.map((row) => ({
        seasonId: row.season_id,
        branchId: row.branch_id,
        participantProfileId: row.participant_profile_id,
        displayName: row.display_name,
        totalPoints: Number(row.total_points),
        rank: Number(row.rank),
      })),
    );
  }
}
