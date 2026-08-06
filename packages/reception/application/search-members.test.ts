import { describe, expect, it } from "vitest";
import { SearchMembersUseCase } from "./search-members";
import { fakeMemberSearchRepository } from "./test-helpers";

describe("SearchMembersUseCase", () => {
  it("returns matching results for a real query", async () => {
    const repo = fakeMemberSearchRepository([
      {
        memberId: "m1",
        memberCode: "ABCD1234",
        fullName: "Ahmed Test",
        phone: "+201000000001",
        activeMembershipStatus: "active",
        activeMembershipEndDate: "2026-09-06",
      },
    ]);
    const useCase = new SearchMembersUseCase(repo);

    const result = await useCase.execute({ query: "Ahmed" });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toHaveLength(1);
  });

  it("skips the repository entirely for a too-short query", async () => {
    const repo = fakeMemberSearchRepository([
      {
        memberId: "m1",
        memberCode: "X",
        fullName: "X",
        phone: "X",
        activeMembershipStatus: null,
        activeMembershipEndDate: null,
      },
    ]);
    const useCase = new SearchMembersUseCase(repo);

    const result = await useCase.execute({ query: "a" });

    expect(result.isOk && result.value).toEqual([]);
  });
});
