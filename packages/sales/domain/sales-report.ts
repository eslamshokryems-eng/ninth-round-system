export interface SalesReportInput {
  branchId: string;
  /** Inclusive, "YYYY-MM-DD" — filters on the lead's created_at. */
  startDate: string;
  endDate: string;
}

export interface SalesBreakdownEntry {
  label: string;
  count: number;
}

export interface SalespersonPerformance {
  salespersonName: string;
  assigned: number;
  converted: number;
  lost: number;
  /** converted / (converted + lost), 0-100. 0 when there's nothing decided yet. */
  conversionRatePercent: number;
}

export interface SalesReportRow {
  leadId: string;
  fullName: string;
  phone: string;
  status: string;
  source: string;
  assignedToName: string | null;
  createdAt: string;
}

export interface SalesReport {
  totalLeadsCreated: number;
  convertedCount: number;
  lostCount: number;
  conversionRatePercent: number;
  bySource: SalesBreakdownEntry[];
  bySalesperson: SalespersonPerformance[];
  rows: SalesReportRow[];
}
