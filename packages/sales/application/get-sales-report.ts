import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SalesReport, SalesReportInput } from "../domain/sales-report";
import type { SalesReportRepository } from "../domain/sales-report-repository";

export class GetSalesReportUseCase implements UseCase<SalesReportInput, SalesReport> {
  constructor(private readonly reports: SalesReportRepository) {}

  async execute(input: SalesReportInput): Promise<Result<SalesReport>> {
    return this.reports.getReport(input);
  }
}
