import { describe, expect, it } from "vitest";
import { err, domainError, ok } from "@9thround/shared-kernel";
import { GetSalesDailyTrendUseCase } from "./get-sales-daily-trend";
import { buildSalesDailyTrendPoint, fakePerformanceReportRepository } from "./test-helpers";

describe("GetSalesDailyTrendUseCase", () => {
  it("delegates to the repository's getSalesDailyTrend", async () => {
    const reports = fakePerformanceReportRepository(undefined, ok([buildSalesDailyTrendPoint()]));
    const useCase = new GetSalesDailyTrendUseCase(reports);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildSalesDailyTrendPoint()]);
    expect(reports.lastDailyTrendInput).toEqual(input);
  });

  it("propagates a repository error unchanged", async () => {
    const reports = fakePerformanceReportRepository(undefined, err(domainError("SALES_DAILY_TREND_FAILED", "boom")));
    const useCase = new GetSalesDailyTrendUseCase(reports);

    const result = await useCase.execute({ branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" });

    expect(result.isErr && result.error.code).toBe("SALES_DAILY_TREND_FAILED");
  });
});
