import type { Result } from "@9thround/shared-kernel";
import type { ProgramType } from "./registration";

export interface MembershipCoachRepository {
  /**
   * Sets (or clears, with coachId null) the coach, session count, and
   * program (sport) on an existing membership — separate from
   * registration/renewal, for when these should be changed on a membership
   * already in progress. Backed by the same "reception/branch_manager
   * update memberships" RLS policy that already covers every other
   * membership field; no new migration needed.
   */
  assignCoach(
    membershipId: string,
    coachId: string | null,
    sessionCount: number | null,
    programType: ProgramType | null,
  ): Promise<Result<void>>;
}
