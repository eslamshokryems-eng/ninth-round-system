import type { Result } from "@9thround/shared-kernel";
import type { ExpiringMembership } from "./expiring-membership";

export interface ExpiringMembershipRepository {
  /** Active memberships ending within the next 7 days (matches reception_dashboard_stats' "expiring this week" window), soonest first. */
  list(branchId: string): Promise<Result<ExpiringMembership[]>>;
}
