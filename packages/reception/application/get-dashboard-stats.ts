import type { Result, UseCase } from "@9thround/shared-kernel";
import type { DashboardStats } from "../domain/dashboard-stats";
import type { DashboardRepository } from "../domain/dashboard-repository";

// No input: RLS scopes the query to the caller via auth.uid(), nothing for the client to pass.
export type GetDashboardStatsInput = Record<string, never>;
export type GetDashboardStatsOutput = DashboardStats;

/**
 * The Reception Dashboard's one query. Access control is entirely the
 * database's job (RLS on the underlying tables the view reads) — this use
 * case has no role check of its own because there's nothing for it to
 * decide beyond "ask the repository," matching docs/13-ddd-architecture.md
 * §13.2's rule that authorization lives in exactly one place.
 */
export class GetDashboardStatsUseCase implements UseCase<GetDashboardStatsInput, GetDashboardStatsOutput> {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(): Promise<Result<GetDashboardStatsOutput>> {
    return this.dashboard.getStats();
  }
}
