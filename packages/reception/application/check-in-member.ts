import type { Result, UseCase } from "@9thround/shared-kernel";
import type { CheckInMemberOutput } from "../domain/check-in";
import type { CheckInRepository } from "../domain/check-in-repository";

/**
 * The "Check In" action's use case. No client-side validation beyond a
 * present member id — the one real business rule (must have an active,
 * unexpired membership) is enforced by check_in_member()
 * (supabase/migrations/20260806000006) and surfaced back as
 * NO_ACTIVE_MEMBERSHIP through the repository's Result.
 */
export class CheckInMemberUseCase implements UseCase<string, CheckInMemberOutput> {
  constructor(private readonly checkIns: CheckInRepository) {}

  async execute(memberId: string): Promise<Result<CheckInMemberOutput>> {
    return this.checkIns.checkIn(memberId);
  }
}
