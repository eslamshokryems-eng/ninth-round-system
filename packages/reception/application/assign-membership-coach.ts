import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MembershipCoachRepository } from "../domain/membership-coach-repository";

export interface AssignMembershipCoachInput {
  membershipId: string;
  coachId: string | null;
  sessionCount: number | null;
}

/** Assigns, changes, or clears the coach on an existing membership (not tied to registration/renewal). */
export class AssignMembershipCoachUseCase implements UseCase<AssignMembershipCoachInput, void> {
  constructor(private readonly memberships: MembershipCoachRepository) {}

  async execute(input: AssignMembershipCoachInput): Promise<Result<void>> {
    return this.memberships.assignCoach(input.membershipId, input.coachId, input.sessionCount);
  }
}
