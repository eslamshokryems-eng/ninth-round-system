export interface CheckInMemberOutput {
  checkInId: string;
  checkedInAt: string;
}

/** One row of a member's attendance history — backs "how many times has this member attended" (docs/phase-1/19-attendance-history.md). */
export interface CheckInHistoryEntry {
  checkInId: string;
  checkedInAt: Date;
  checkedInByName: string | null;
}

/** One row of the Dashboard's "Recent Check-Ins" list — across all members, not one. */
export interface RecentCheckInEntry {
  checkInId: string;
  memberId: string;
  memberName: string;
  checkedInAt: Date;
}

/** Backs the Dashboard's check-in trend chart — every check-in from today (branch-scoped by RLS), for bucketing by hour. */
export interface TodayCheckInEntry {
  checkedInAt: Date;
}
