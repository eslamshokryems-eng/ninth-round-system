import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SalesDashboardStats } from "../domain/sales-dashboard-stats";
import type { SalesDashboardRepository } from "../domain/sales-dashboard-repository";

export type GetSalesDashboardStatsInput = Record<string, never>;

export class GetSalesDashboardStatsUseCase implements UseCase<GetSalesDashboardStatsInput, SalesDashboardStats> {
  constructor(private readonly dashboard: SalesDashboardRepository) {}

  async execute(): Promise<Result<SalesDashboardStats>> {
    return this.dashboard.getStats();
  }
}
