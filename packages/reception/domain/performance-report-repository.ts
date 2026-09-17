import type { Result } from "@9thround/shared-kernel";
import type { PerformanceReportInput, PerformanceRow } from "./performance-report";

/** Both methods run the same aggregation shape server-side (get_sales_performance/get_coach_performance) — see supabase/migrations/20260918000001_performance_targets.sql. */
export interface PerformanceReportRepository {
  getSalesPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>>;
  getCoachPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>>;
}
