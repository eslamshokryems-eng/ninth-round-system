export type PerformanceCategory = "sales" | "coach";
export type PerformancePeriodType = "weekly" | "monthly" | "yearly";

export interface PerformanceTarget {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  category: PerformanceCategory;
  periodType: PerformancePeriodType;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListPerformanceTargetsInput {
  branchId: string;
  category?: PerformanceCategory | null;
  /** Any target whose period overlaps this range — matches how the dashboard's own date range is used to pick "which targets apply right now". */
  startDate: string;
  endDate: string;
}

export interface CreatePerformanceTargetInput {
  staffId: string;
  branchId: string;
  category: PerformanceCategory;
  periodType: PerformancePeriodType;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  notes: string | null;
}

export interface UpdatePerformanceTargetInput {
  id: string;
  targetAmount: number;
  notes: string | null;
}
