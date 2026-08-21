import { describe, expect, it } from "vitest";
import { ListLeadsUseCase } from "./list-leads";
import { buildLeadSummary, fakeLeadRepository } from "./test-helpers";

describe("ListLeadsUseCase", () => {
  it("returns whatever the repository lists — RLS (not this use case) decides which leads that is", async () => {
    const leads = fakeLeadRepository();
    leads.list_ = [buildLeadSummary({ leadId: "lead-1" }), buildLeadSummary({ leadId: "lead-2" })];
    const useCase = new ListLeadsUseCase(leads);

    const result = await useCase.execute();

    expect(result.isOk && result.value).toHaveLength(2);
  });
});
