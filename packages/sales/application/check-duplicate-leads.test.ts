import { describe, expect, it } from "vitest";
import { CheckDuplicateLeadsUseCase } from "./check-duplicate-leads";
import { buildLeadSummary, fakeLeadRepository } from "./test-helpers";

describe("CheckDuplicateLeadsUseCase", () => {
  it("returns an empty result for a blank phone without querying the repository", async () => {
    const leads = fakeLeadRepository();
    leads.duplicates = [buildLeadSummary()];
    const useCase = new CheckDuplicateLeadsUseCase(leads);

    const result = await useCase.execute({ branchId: "branch-1", phone: "  " });

    expect(result.isOk && result.value).toEqual([]);
  });

  it("surfaces same-branch, same-phone leads as a non-blocking warning", async () => {
    const leads = fakeLeadRepository();
    leads.duplicates = [buildLeadSummary({ leadId: "lead-existing" })];
    const useCase = new CheckDuplicateLeadsUseCase(leads);

    const result = await useCase.execute({ branchId: "branch-1", phone: "+201000000010" });

    expect(result.isOk && result.value[0]?.leadId).toBe("lead-existing");
  });
});
