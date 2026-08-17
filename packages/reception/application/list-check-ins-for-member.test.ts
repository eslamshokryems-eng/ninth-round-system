import { describe, expect, it } from "vitest";
import { ListCheckInsForMemberUseCase } from "./list-check-ins-for-member";
import { fakeCheckInRepository } from "./test-helpers";

describe("ListCheckInsForMemberUseCase", () => {
  it("returns the member's check-in history", async () => {
    const repo = fakeCheckInRepository();
    repo.history = [
      { checkInId: "1", checkedInAt: new Date("2026-08-10T08:00:00Z"), checkedInByName: "Reception Test" },
      { checkInId: "2", checkedInAt: new Date("2026-08-05T08:00:00Z"), checkedInByName: null },
    ];
    const useCase = new ListCheckInsForMemberUseCase(repo);

    const result = await useCase.execute("member-1");

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toHaveLength(2);
    expect(repo.lastMemberId).toBe("member-1");
  });

  it("returns an empty list for a member with no visits yet", async () => {
    const repo = fakeCheckInRepository();
    const useCase = new ListCheckInsForMemberUseCase(repo);

    const result = await useCase.execute("member-1");

    expect(result.isOk && result.value).toEqual([]);
  });
});
