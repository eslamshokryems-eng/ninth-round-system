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
