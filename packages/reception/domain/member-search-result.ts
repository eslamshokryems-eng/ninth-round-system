export type MembershipStatus = "active" | "expired" | "cancelled";

export interface MemberSearchResult {
  memberId: string;
  memberCode: string;
  fullName: string;
  phone: string;
  /** null when the member has no membership yet (e.g. record exists but registration is incomplete — shouldn't happen via the app, but is possible via direct DB access). */
  activeMembershipStatus: MembershipStatus | null;
  activeMembershipEndDate: string | null;
}
