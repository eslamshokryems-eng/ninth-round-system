import type { Result } from "@9thround/shared-kernel";
import type {
  PerformanceReportInput,
  PerformanceRow,
  SalesByProgramEntry,
  SalesDailyTrendPoint,
  SalesTransaction,
  SalesTransactionsInput,
} from "./performance-report";

/** All methods run their aggregation server-side (get_sales_performance/get_coach_performance/get_sales_daily_trend/get_sales_by_program/get_sales_transactions) — see supabase/migrations/20260918000001_performance_targets.sql and 20260920000002_sales_performance_dashboard.sql. */
export interface PerformanceReportRepository {
  getSalesPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>>;
  getCoachPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>>;
  getSalesDailyTrend(input: PerformanceReportInput): Promise<Result<SalesDailyTrendPoint[]>>;
  getSalesByProgram(input: PerformanceReportInput): Promise<Result<SalesByProgramEntry[]>>;
  getSalesTransactions(input: SalesTransactionsInput): Promise<Result<SalesTransaction[]>>;
}
