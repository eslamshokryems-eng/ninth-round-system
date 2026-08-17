import type { Result } from "@9thround/shared-kernel";
import type { CheckInHistoryEntry, CheckInMemberOutput } from "./check-in";

export interface CheckInRepository {
  checkIn(memberId: string): Promise<Result<CheckInMemberOutput>>;
  /** Most-recent-first, capped (see the infrastructure implementation) — a member's full attendance history, for "how many times has this member attended." */
  listByMember(memberId: string): Promise<Result<CheckInHistoryEntry[]>>;
}
