import type { Result } from "@9thround/shared-kernel";
import type { CheckInHistoryEntry, CheckInMemberOutput, RecentCheckInEntry } from "./check-in";

export interface CheckInRepository {
  checkIn(memberId: string): Promise<Result<CheckInMemberOutput>>;
  /** Most-recent-first, capped (see the infrastructure implementation) — a member's full attendance history, for "how many times has this member attended." */
  listByMember(memberId: string): Promise<Result<CheckInHistoryEntry[]>>;
  /** Most-recent-first, across all members at the caller's branch(es) — backs the Dashboard's "Recent Check-Ins" list. */
  listRecent(limit: number): Promise<Result<RecentCheckInEntry[]>>;
}
