import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { GetCoachPerformanceUseCase } from "./get-coach-performance";
import { buildPerformanceRow, fakePerformanceReportRepository } from "./test-helpers";

describe("GetCoachPerformanceUseCase", () => {
  it("delegates to the repository's getCoachPerformance", async () => {
    const reports = fakePerformanceReportRepository();
    const useCase = new GetCoachPerformanceUseCase(reports);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildPerformanceRow()]);
    expect(reports.lastCoachInput).toEqual(input);
    expect(reports.lastSalesInput).toBeNull();
  });

  it("propagates a repository error unchanged", async () => {
    const reports = fakePerformanceReportRepository(err(domainError("COACH_PERFORMANCE_REPORT_FAILED", "boom")));
    const useCase = new GetCoachPerformanceUseCase(reports);

    const result = await useCase.execute({ branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" });

    expect(result.isErr && result.error.code).toBe("COACH_PERFORMANCE_REPORT_FAILED");
  });
});
