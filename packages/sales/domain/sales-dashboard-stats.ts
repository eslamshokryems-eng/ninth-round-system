export interface SalesDashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  convertedThisMonth: number;
  lostThisMonth: number;
  /** converted / (converted + lost) this month, as a 0-100 percentage. 0 (never NaN) when there's nothing to divide by yet. */
  conversionRatePercent: number;
}
