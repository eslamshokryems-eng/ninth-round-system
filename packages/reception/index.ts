import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { GetDashboardStatsUseCase } from "./application/get-dashboard-stats";
import { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";

export type { DashboardStats } from "./domain/dashboard-stats";
export type { DashboardRepository } from "./domain/dashboard-repository";
export {
  GetDashboardStatsUseCase,
  type GetDashboardStatsOutput,
} from "./application/get-dashboard-stats";
export { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";

/**
 * The Reception context's composition root — mirrors
 * packages/identity/index.ts's createIdentityModule(). Currently just the
 * Dashboard (read-only); Member/Membership/Payment CRUD use cases join
 * here as they're built (docs/phase-1/14-reception-membership.md §14.4).
 */
export function createReceptionModule(client: TypedSupabaseClient) {
  const dashboardRepository = new SupabaseDashboardRepository(client);
  return {
    getDashboardStats: new GetDashboardStatsUseCase(dashboardRepository),
  };
}
