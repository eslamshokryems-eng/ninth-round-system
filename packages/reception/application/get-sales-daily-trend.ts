import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PerformanceReportInput, SalesDailyTrendPoint } from "../domain/performance-report";
import type { PerformanceReportRepository } from "../domain/performance-report-repository";

export class GetSalesDailyTrendUseCase implements UseCase<PerformanceReportInput, SalesDailyTrendPoint[]> {
  constructor(private readonly reports: PerformanceReportRepository) {}

  async execute(input: PerformanceReportInput): Promise<Result<SalesDailyTrendPoint[]>> {
    return this.reports.getSalesDailyTrend(input);
  }
}
