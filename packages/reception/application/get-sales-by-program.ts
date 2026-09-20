import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PerformanceReportInput, SalesByProgramEntry } from "../domain/performance-report";
import type { PerformanceReportRepository } from "../domain/performance-report-repository";

export class GetSalesByProgramUseCase implements UseCase<PerformanceReportInput, SalesByProgramEntry[]> {
  constructor(private readonly reports: PerformanceReportRepository) {}

  async execute(input: PerformanceReportInput): Promise<Result<SalesByProgramEntry[]>> {
    return this.reports.getSalesByProgram(input);
  }
}
