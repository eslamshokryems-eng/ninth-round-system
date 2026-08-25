import type { Result } from "@9thround/shared-kernel";
import type { RevenueReport, RevenueReportInput } from "./revenue-report";

export interface RevenueReportRepository {
  getReport(input: RevenueReportInput): Promise<Result<RevenueReport>>;
}
