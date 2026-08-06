import type { Result } from "@9thround/shared-kernel";
import type { DashboardStats } from "./dashboard-stats";

/**
 * Port implemented by infrastructure/supabase-dashboard-repository.ts (and,
 * in tests, by an in-memory fake). No application use case imports Supabase
 * directly — see packages/identity/domain/profile-repository.ts for the
 * same pattern this mirrors.
 */
export interface DashboardRepository {
  getStats(): Promise<Result<DashboardStats>>;
}
