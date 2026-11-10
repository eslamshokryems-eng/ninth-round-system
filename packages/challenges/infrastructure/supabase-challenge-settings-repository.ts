import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ChallengeSettingsRepository } from "../domain/challenge-settings-repository";
import { DEFAULT_MAX_CHALLENGE_WEIGHT, DEFAULT_MIN_CHALLENGE_WEIGHT } from "../domain/challenge";

export class SupabaseChallengeSettingsRepository implements ChallengeSettingsRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async setWeightRange(min: number, max: number): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_challenge_weight_range", { p_min: min, p_max: max });

    if (error) {
      return err(domainError("CHALLENGE_WEIGHT_RANGE_UPDATE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async getWeightRange(): Promise<Result<{ min: number; max: number }>> {
    // get_challenge_weight_range() is readable by exactly the roles that may
    // create a competition. A member or coach is refused — and does not need
    // the number, since neither can create one — so the packaged defaults
    // stand in rather than failing the page. create_challenge() re-validates
    // against the real range regardless of what this returns.
    const { data, error } = await this.client.rpc("get_challenge_weight_range").single();

    if (error || !data) {
      return ok({ min: DEFAULT_MIN_CHALLENGE_WEIGHT, max: DEFAULT_MAX_CHALLENGE_WEIGHT });
    }
    const row = data as { min_weight: number; max_weight: number };
    return ok({ min: row.min_weight, max: row.max_weight });
  }
}
