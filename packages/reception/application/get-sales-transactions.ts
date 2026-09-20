import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SalesTransaction, SalesTransactionsInput } from "../domain/performance-report";
import type { PerformanceReportRepository } from "../domain/performance-report-repository";

export class GetSalesTransactionsUseCase implements UseCase<SalesTransactionsInput, SalesTransaction[]> {
  constructor(private readonly reports: PerformanceReportRepository) {}

  async execute(input: SalesTransactionsInput): Promise<Result<SalesTransaction[]>> {
    return this.reports.getSalesTransactions(input);
  }
}
