import { describe, expect, it } from "vitest";
import { ListRecentCheckInsUseCase } from "./list-recent-check-ins";
import { fakeCheckInRepository } from "./test-helpers";

describe("ListRecentCheckInsUseCase", () => {
  it("returns the repository's recent check-ins, most-recent-first", async () => {
    const checkIns = fakeCheckInRepository();
    checkIns.recent = [
      { checkInId: "c2", memberId: "m2", memberName: "Sara Ali", checkedInAt: new Date("2026-08-19T10:05:00.000Z") },
      { checkInId: "c1", memberId: "m1", memberName: "Ahmed Mostafa", checkedInAt: new Date("2026-08-19T10:00:00.000Z") },
    ];
    const useCase = new ListRecentCheckInsUseCase(checkIns);

    const result = await useCase.execute();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toHaveLength(2);
    expect(result.isOk && result.value[0]?.memberName).toBe("Sara Ali");
  });

  it("returns an empty list when nobody has checked in yet", async () => {
    const checkIns = fakeCheckInRepository();
    const useCase = new ListRecentCheckInsUseCase(checkIns);

    const result = await useCase.execute();

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toEqual([]);
  });
});
