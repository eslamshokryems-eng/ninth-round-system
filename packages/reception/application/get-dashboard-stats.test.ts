import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { GetDashboardStatsUseCase } from "./get-dashboard-stats";
import { FakeDashboardRepository, buildDashboardStats, fakeDashboardRepository } from "./test-helpers";

describe("GetDashboardStatsUseCase", () => {
  it("returns the stats from the repository", async () => {
    const repo = fakeDashboardRepository({ activeMembers: 42, dailyRevenue: 1500 });
    const useCase = new GetDashboardStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.activeMembers).toBe(42);
    expect(result.isOk && result.value.dailyRevenue).toBe(1500);
  });

  it("propagates a repository failure without transforming it", async () => {
    const failure = err(domainError("DASHBOARD_STATS_QUERY_FAILED", "boom"));
    const repo = new FakeDashboardRepository(failure);
    const useCase = new GetDashboardStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.isErr).toBe(true);
    expect(result.isErr && result.error.code).toBe("DASHBOARD_STATS_QUERY_FAILED");
  });

  it("test helper builds a full zeroed stats object by default", () => {
    const stats = buildDashboardStats();
    expect(stats.activeMembers).toBe(0);
    expect(stats.monthlyRevenue).toBe(0);
  });
});
