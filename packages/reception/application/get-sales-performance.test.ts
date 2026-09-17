import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { GetSalesPerformanceUseCase } from "./get-sales-performance";
import { buildPerformanceRow, fakePerformanceReportRepository } from "./test-helpers";

describe("GetSalesPerformanceUseCase", () => {
  it("delegates to the repository's getSalesPerformance", async () => {
    const reports = fakePerformanceReportRepository();
    const useCase = new GetSalesPerformanceUseCase(reports);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildPerformanceRow()]);
    expect(reports.lastSalesInput).toEqual(input);
    expect(reports.lastCoachInput).toBeNull();
  });

  it("propagates a repository error unchanged", async () => {
    const reports = fakePerformanceReportRepository(err(domainError("SALES_PERFORMANCE_REPORT_FAILED", "boom")));
    const useCase = new GetSalesPerformanceUseCase(reports);

    const result = await useCase.execute({ branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" });

    expect(result.isErr && result.error.code).toBe("SALES_PERFORMANCE_REPORT_FAILED");
  });
});
