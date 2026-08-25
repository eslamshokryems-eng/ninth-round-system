import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RevenueReport, RevenueReportInput } from "../domain/revenue-report";
import type { RevenueReportRepository } from "../domain/revenue-report-repository";

export class GetRevenueReportUseCase implements UseCase<RevenueReportInput, RevenueReport> {
  constructor(private readonly reports: RevenueReportRepository) {}

  async execute(input: RevenueReportInput): Promise<Result<RevenueReport>> {
    return this.reports.getReport(input);
  }
}
