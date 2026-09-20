import { describe, expect, it } from "vitest";
import { err, domainError, ok } from "@9thround/shared-kernel";
import { GetSalesByProgramUseCase } from "./get-sales-by-program";
import { buildSalesByProgramEntry, fakePerformanceReportRepository } from "./test-helpers";

describe("GetSalesByProgramUseCase", () => {
  it("delegates to the repository's getSalesByProgram", async () => {
    const reports = fakePerformanceReportRepository(undefined, undefined, ok([buildSalesByProgramEntry()]));
    const useCase = new GetSalesByProgramUseCase(reports);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildSalesByProgramEntry()]);
    expect(reports.lastByProgramInput).toEqual(input);
  });

  it("propagates a repository error unchanged", async () => {
    const reports = fakePerformanceReportRepository(
      undefined,
      undefined,
      err(domainError("SALES_BY_PROGRAM_FAILED", "boom")),
    );
    const useCase = new GetSalesByProgramUseCase(reports);

    const result = await useCase.execute({ branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" });

    expect(result.isErr && result.error.code).toBe("SALES_BY_PROGRAM_FAILED");
  });
});
