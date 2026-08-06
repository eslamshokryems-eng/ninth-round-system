/**
 * The Reception Dashboard's seven headline numbers — a read model backed
 * by the `reception_dashboard_stats` SQL view
 * (supabase/migrations/20260806000002_reception_membership.sql), not an
 * aggregate with behavior. There's nothing to validate or mutate here: the
 * database computes these from `members`/`memberships`/`membership_payments`
 * directly, so this type exists purely to give the application/
 * presentation layers a named, typed shape instead of a bag of `unknown`.
 *
 * Note: the underlying view is currently a global aggregate, not scoped to
 * a branch — acceptable for Phase 1 (one seeded branch), documented as a
 * known simplification in docs/phase-1/14-reception-membership.md.
 */
export interface DashboardStats {
  activeMembers: number;
  newMembersToday: number;
  expiringToday: number;
  expiringThisWeek: number;
  expiredMemberships: number;
  dailyRevenue: number;
  monthlyRevenue: number;
}
