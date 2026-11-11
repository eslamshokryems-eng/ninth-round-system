import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CreateChallengeSeasonInput } from "../domain/challenge-season";
import type { ChallengeSeasonRepository } from "../domain/challenge-season-repository";
import type { ChallengeSeason } from "../domain/challenge-season";

export class SupabaseChallengeSeasonRepository implements ChallengeSeasonRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async create(input: CreateChallengeSeasonInput): Promise<Result<{ seasonId: string }>> {
    const { data, error } = await this.client
      .rpc("create_challenge_season", {
        p_name: input.name,
        p_description: input.description,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
      })
      .single();

    if (error) {
      return err(domainError("CHALLENGE_SEASON_CREATE_FAILED", error.message));
    }
    const row = data as { season_id: string };
    return ok({ seasonId: row.season_id });
  }

  async list(): Promise<Result<ChallengeSeason[]>> {
    const { data, error } = await this.client
      .from("challenge_seasons")
      .select("id, name, description, starts_at, ends_at, status, created_by, created_at, updated_at")
      .order("starts_at", { ascending: false });

    if (error) {
      return err(domainError("CHALLENGE_SEASON_LIST_FAILED", error.message));
    }
    const rows = (data ?? []) as {
      id: string; name: string; description: string | null;
      starts_at: string; ends_at: string; status: ChallengeSeason["status"];
      created_by: string; created_at: string; updated_at: string;
    }[];
    return ok(
      rows.map((row) => ({
        seasonId: row.id,
        name: row.name,
        description: row.description,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    );
  }
}
