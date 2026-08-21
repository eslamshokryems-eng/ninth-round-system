import type { Result } from "@9thround/shared-kernel";
import type { SalesDashboardStats } from "./sales-dashboard-stats";

export interface SalesDashboardRepository {
  getStats(): Promise<Result<SalesDashboardStats>>;
}
