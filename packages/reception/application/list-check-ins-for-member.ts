import type { Result, UseCase } from "@9thround/shared-kernel";
import type { CheckInHistoryEntry } from "../domain/check-in";
import type { CheckInRepository } from "../domain/check-in-repository";

/** Backs the Member Detail page's "Attendance" section — the full check-in history for one member, so Reception can see how many times they've attended. */
export class ListCheckInsForMemberUseCase implements UseCase<string, CheckInHistoryEntry[]> {
  constructor(private readonly checkIns: CheckInRepository) {}

  async execute(memberId: string): Promise<Result<CheckInHistoryEntry[]>> {
    return this.checkIns.listByMember(memberId);
  }
}
