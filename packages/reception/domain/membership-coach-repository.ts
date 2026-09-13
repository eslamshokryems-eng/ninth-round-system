import type { Result } from "@9thround/shared-kernel";

export interface MembershipCoachRepository {
  /**
   * Sets (or clears, with coachId null) the coach and session count on an
   * existing membership — separate from registration/renewal, for when a
   * coach should be assigned/changed on a membership already in progress.
   * Backed by the same "reception/branch_manager update memberships" RLS
   * policy that already covers every other membership field; no new
   * migration needed.
   */
  assignCoach(membershipId: string, coachId: string | null, sessionCount: number | null): Promise<Result<void>>;
}
