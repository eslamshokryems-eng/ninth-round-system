import type { Result } from "@9thround/shared-kernel";
import type { Profile } from "./profile";

/**
 * Port implemented by infrastructure/supabase-profile-repository.ts (and, in
 * tests, by an in-memory fake — see application/*.test.ts). No application
 * use case imports Supabase directly; it only ever depends on this
 * interface, which is how the use cases stay testable without a database.
 */
export interface ProfileRepository {
  findById(id: string): Promise<Result<Profile | null>>;
  save(profile: Profile): Promise<Result<void>>;
  /** Name search, used by staff role management (admins looking up an account to promote). */
  search(query: string): Promise<Result<Profile[]>>;
}
