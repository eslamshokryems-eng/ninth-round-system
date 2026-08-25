export interface MembershipsReportInput {
  branchId: string;
  /** Inclusive, "YYYY-MM-DD" — filters on the membership's start_date. */
  startDate: string;
  endDate: string;
}

export interface MembershipsBreakdownEntry {
  label: string;
  count: number;
}

export interface MembershipsReportRow {
  membershipId: string;
  memberFullName: string;
  membershipTypeName: string;
  startDate: string;
  endDate: string;
  finalPrice: number;
  status: "active" | "expired" | "cancelled";
  /** True when the member's own account was created within this same date range — a first membership, not a renewal. */
  isNewMember: boolean;
}

export interface MembershipsReport {
  totalMemberships: number;
  newMemberCount: number;
  renewalCount: number;
  byMembershipType: MembershipsBreakdownEntry[];
  byStatus: MembershipsBreakdownEntry[];
  rows: MembershipsReportRow[];
}
