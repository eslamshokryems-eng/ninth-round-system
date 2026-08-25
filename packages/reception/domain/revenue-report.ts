import type { PaymentMethod } from "./registration";

export interface RevenueReportInput {
  branchId: string;
  /** Inclusive, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
}

export interface RevenueBreakdownEntry {
  label: string;
  total: number;
}

export interface RevenueTrendPoint {
  date: string;
  total: number;
}

export interface RevenueReportRow {
  date: string;
  source: "membership" | "other_sale";
  description: string;
  personName: string | null;
  paymentMethod: PaymentMethod;
  amount: number;
}

export interface RevenueReport {
  totalRevenue: number;
  membershipRevenue: number;
  otherSalesRevenue: number;
  byPaymentMethod: RevenueBreakdownEntry[];
  byMembershipType: RevenueBreakdownEntry[];
  dailyTrend: RevenueTrendPoint[];
  rows: RevenueReportRow[];
}
