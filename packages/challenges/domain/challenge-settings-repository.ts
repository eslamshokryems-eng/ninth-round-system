import type { Result } from "@9thround/shared-kernel";

/** Super Admin-only writes — mirrors how security_settings is managed elsewhere in this codebase. No read method here yet: Phase 2's use cases that need the configured weight range take it as an explicit input (the caller fetches current settings separately) rather than this package performing its own read — a read-side use case is deferred to whichever phase first builds a settings screen. */
export interface ChallengeSettingsRepository {
  setWeightRange(min: number, max: number): Promise<Result<void>>;
  /**
   * The configured weight range, for the create form's validation hint.
   * challenge_settings is readable by super_admin only, so this resolves
   * to the packaged defaults for everyone else rather than failing the
   * page — the authoritative range is re-checked inside create_challenge()
   * either way.
   */
  getWeightRange(): Promise<Result<{ min: number; max: number }>>;
}
