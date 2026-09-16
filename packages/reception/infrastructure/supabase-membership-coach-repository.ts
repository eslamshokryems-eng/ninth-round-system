import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MembershipCoachRepository } from "../domain/membership-coach-repository";
import type { ProgramType } from "../domain/registration";

export class SupabaseMembershipCoachRepository implements MembershipCoachRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async assignCoach(
    membershipId: string,
    coachId: string | null,
    sessionCount: number | null,
    programType: ProgramType | null,
  ): Promise<Result<void>> {
    const { error } = await this.client
      .from("memberships")
      .update({ coach_id: coachId, session_count: sessionCount, program_type: programType })
      .eq("id", membershipId);

    if (error) {
      return err(domainError("ASSIGN_COACH_FAILED", error.message));
    }
    return ok(undefined);
  }
}
