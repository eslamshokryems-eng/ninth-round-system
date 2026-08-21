import { describe, expect, it } from "vitest";
import { GetTodayCheckInsUseCase } from "./get-today-check-ins";
import { fakeCheckInRepository } from "./test-helpers";

describe("GetTodayCheckInsUseCase", () => {
  it("returns the repository's today check-ins", async () => {
    const checkIns = fakeCheckInRepository();
    checkIns.today = [
      { checkedInAt: new Date("2026-08-21T09:05:00.000Z") },
      { checkedInAt: new Date("2026-08-21T09:40:00.000Z") },
    ];
    const useCase = new GetTodayCheckInsUseCase(checkIns);

    const result = await useCase.execute();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toHaveLength(2);
  });

  it("returns an empty list when nobody has checked in yet today", async () => {
    const checkIns = fakeCheckInRepository();
    const useCase = new GetTodayCheckInsUseCase(checkIns);

    const result = await useCase.execute();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toEqual([]);
  });
});
