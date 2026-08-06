export interface MemberSearchResult {
  memberId: string;
  memberCode: string;
  fullName: string;
  phone: string;
  /** null when the member has no membership yet (e.g. record exists but registration is incomplete — shouldn't happen via the app, but is possible via direct DB access). */
  activeMembershipStatus: "active" | "expired" | "cancelled" | null;
  activeMembershipEndDate: string | null;
}
