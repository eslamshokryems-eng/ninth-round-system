import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { Profile } from "../domain/profile";
import type { ProfileRepository } from "../domain/profile-repository";
import { profileToRowUpdate, rowToProfile } from "./profile-mapper";

/**
 * The Supabase-backed implementation of the ProfileRepository port. RLS on
 * the `profiles` table (supabase/migrations/20260801000002_profiles_and_trainers.sql)
 * still applies here — this repository does not use the service-role key,
 * so a client can only ever load/save its own row (or, for a trainer/
 * nutritionist/admin caller, whatever RLS additionally permits) no matter
 * what a use case asks for. Authorization is enforced twice, deliberately:
 * once in the domain (Role.canAssignRole) and once at the database — see
 * docs/07-security-plan.md §7.2.
 */
export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findById(id: string): Promise<Result<Profile | null>> {
    const { data, error } = await this.client.from("profiles").select("*").eq("id", id).maybeSingle();

    if (error) {
      return err(domainError("PROFILE_FETCH_FAILED", error.message));
    }
    return ok(data ? rowToProfile(data) : null);
  }

  async save(profile: Profile): Promise<Result<void>> {
    const { error } = await this.client
      .from("profiles")
      .update(profileToRowUpdate(profile))
      .eq("id", profile.id);

    if (error) {
      return err(domainError("PROFILE_SAVE_FAILED", error.message));
    }
    return ok(undefined);
  }
}
