import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ChallengeDisplayName } from "../domain/challenge-display-name";
import type { ChallengeDisplayNameRepository } from "../domain/challenge-display-name-repository";

interface DisplayNameRow {
  profile_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

function toDisplayName(row: DisplayNameRow): ChallengeDisplayName {
  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseChallengeDisplayNameRepository implements ChallengeDisplayNameRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getOwn(): Promise<Result<ChallengeDisplayName | null>> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || !userData.user) {
      return err(domainError("NOT_AUTHENTICATED", "You must be signed in to read your display name."));
    }

    const { data, error } = await this.client
      .from("challenge_display_names")
      .select("profile_id, display_name, created_at, updated_at")
      .eq("profile_id", userData.user.id)
      .maybeSingle();

    if (error) {
      return err(domainError("CHALLENGE_DISPLAY_NAME_FETCH_FAILED", error.message));
    }
    return ok(data ? toDisplayName(data as DisplayNameRow) : null);
  }

  async setOwn(displayName: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_challenge_display_name", { p_display_name: displayName });

    if (error) {
      return err(domainError("CHALLENGE_DISPLAY_NAME_SET_FAILED", error.message));
    }
    return ok(undefined);
  }
}
