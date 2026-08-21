import { describe, expect, it } from "vitest";
import { GetSalesDashboardStatsUseCase } from "./get-sales-dashboard-stats";
import { fakeSalesDashboardRepository } from "./test-helpers";

describe("GetSalesDashboardStatsUseCase", () => {
  it("delegates straight to the repository", async () => {
    const dashboard = fakeSalesDashboardRepository({ totalLeads: 12, conversionRatePercent: 40 });
    const useCase = new GetSalesDashboardStatsUseCase(dashboard);

    const result = await useCase.execute();

    expect(result.isOk && result.value.totalLeads).toBe(12);
    expect(result.isOk && result.value.conversionRatePercent).toBe(40);
  });
});
