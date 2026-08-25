import type { Result } from "@9thround/shared-kernel";
import type { SalesReport, SalesReportInput } from "./sales-report";

export interface SalesReportRepository {
  getReport(input: SalesReportInput): Promise<Result<SalesReport>>;
}
