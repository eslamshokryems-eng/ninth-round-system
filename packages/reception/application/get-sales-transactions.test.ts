import { describe, expect, it } from "vitest";
import { err, domainError, ok } from "@9thround/shared-kernel";
import { GetSalesTransactionsUseCase } from "./get-sales-transactions";
import { buildSalesTransaction, fakePerformanceReportRepository } from "./test-helpers";

describe("GetSalesTransactionsUseCase", () => {
  it("delegates to the repository's getSalesTransactions", async () => {
    const reports = fakePerformanceReportRepository(undefined, undefined, undefined, ok([buildSalesTransaction()]));
    const useCase = new GetSalesTransactionsUseCase(reports);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30", staffId: "staff-1" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildSalesTransaction()]);
    expect(reports.lastTransactionsInput).toEqual(input);
  });

  it("propagates a repository error unchanged", async () => {
    const reports = fakePerformanceReportRepository(
      undefined,
      undefined,
      undefined,
      err(domainError("SALES_TRANSACTIONS_FAILED", "boom")),
    );
    const useCase = new GetSalesTransactionsUseCase(reports);

    const result = await useCase.execute({
      branchId: "branch-1",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      staffId: "staff-1",
    });

    expect(result.isErr && result.error.code).toBe("SALES_TRANSACTIONS_FAILED");
  });
});
