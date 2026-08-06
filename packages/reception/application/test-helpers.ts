import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { DashboardRepository } from "../domain/dashboard-repository";
import type { DashboardStats } from "../domain/dashboard-stats";

export function buildDashboardStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    activeMembers: 0,
    newMembersToday: 0,
    expiringToday: 0,
    expiringThisWeek: 0,
    expiredMemberships: 0,
    dailyRevenue: 0,
    monthlyRevenue: 0,
    ...overrides,
  };
}

export class FakeDashboardRepository implements DashboardRepository {
  constructor(private result: Result<DashboardStats>) {}

  async getStats(): Promise<Result<DashboardStats>> {
    return this.result;
  }
}

export function fakeDashboardRepository(stats: Partial<DashboardStats> = {}): FakeDashboardRepository {
  return new FakeDashboardRepository(ok(buildDashboardStats(stats)));
}
