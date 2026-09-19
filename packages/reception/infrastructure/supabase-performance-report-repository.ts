import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { PerformanceReportInput, PerformanceRow } from "../domain/performance-report";
import type { PerformanceReportRepository } from "../domain/performance-report-repository";

interface PerformanceRpcRow {
  staff_id: string;
  staff_name: string;
  transaction_count: number;
  gross_revenue: number;
  discount_total: number;
  net_revenue: number;
  collected_revenue: number;
}

function toPerformanceRow(row: PerformanceRpcRow): PerformanceRow {
  return {
    staffId: row.staff_id,
    staffName: row.staff_name,
    transactionCount: Number(row.transaction_count),
    grossRevenue: Number(row.gross_revenue),
    discountTotal: Number(row.discount_total),
    netRevenue: Number(row.net_revenue),
    collectedRevenue: Number(row.collected_revenue),
  };
}

/**
 * Calls the get_sales_performance()/get_coach_performance() Postgres
 * functions (supabase/migrations/20260918000001_performance_targets.sql) —
 * the aggregation (GROUP BY/SUM, double-counting-safe) runs server-side,
 * unlike get-revenue-report's client-side Map aggregation over raw rows.
 */
export class SupabasePerformanceReportRepository implements PerformanceReportRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getSalesPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>> {
    const { data, error } = await this.client.rpc("get_sales_performance", {
      p_branch_id: input.branchId,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_staff_id: input.staffId ?? null,
      p_program_type: input.programType ?? null,
    });

    if (error) {
      return err(domainError("SALES_PERFORMANCE_REPORT_FAILED", error.message));
    }
    return ok((data as unknown as PerformanceRpcRow[]).map(toPerformanceRow));
  }

  async getCoachPerformance(input: PerformanceReportInput): Promise<Result<PerformanceRow[]>> {
    const { data, error } = await this.client.rpc("get_coach_performance", {
      p_branch_id: input.branchId,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_staff_id: input.staffId ?? null,
      p_program_type: input.programType ?? null,
    });

    if (error) {
      return err(domainError("COACH_PERFORMANCE_REPORT_FAILED", error.message));
    }
    return ok((data as unknown as PerformanceRpcRow[]).map(toPerformanceRow));
  }
}
