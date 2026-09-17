import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PerformanceReportInput, PerformanceRow } from "../domain/performance-report";
import type { PerformanceReportRepository } from "../domain/performance-report-repository";

export class GetCoachPerformanceUseCase implements UseCase<PerformanceReportInput, PerformanceRow[]> {
  constructor(private readonly reports: PerformanceReportRepository) {}

  async execute(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>> {
    return this.reports.getCoachPerformance(input);
  }
}
