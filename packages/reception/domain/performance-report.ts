import type { ProgramType } from "./registration";

export interface PerformanceReportInput {
  branchId: string;
  /** Filters on membership_payments.payment_date — when the money came in, not the membership's start_date. */
  startDate: string;
  endDate: string;
  /** Narrows to one employee's own numbers (the Employee Detail drill-down). */
  staffId?: string | null;
  programType?: ProgramType | null;
}

export interface PerformanceRow {
  staffId: string;
  staffName: string;
  transactionCount: number;
  /** Sum of each attributed membership's price (before discount). */
  grossRevenue: number;
  discountTotal: number;
  /** Sum of each attributed membership's final_price (price - discount) — the invoiced amount. */
  netRevenue: number;
  /** Sum of what was actually paid via membership_payments — the primary KPI. */
  collectedRevenue: number;
}
