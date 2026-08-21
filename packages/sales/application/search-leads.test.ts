import { describe, expect, it } from "vitest";
import { SearchLeadsUseCase } from "./search-leads";
import { buildLeadSummary, fakeLeadRepository } from "./test-helpers";

describe("SearchLeadsUseCase", () => {
  it("returns an empty result without querying the repository for a very short query", async () => {
    const leads = fakeLeadRepository();
    leads.list_ = [buildLeadSummary()];
    const useCase = new SearchLeadsUseCase(leads);

    const result = await useCase.execute({ query: "a" });

    expect(result.isOk && result.value).toEqual([]);
  });

  it("searches once the query is long enough", async () => {
    const leads = fakeLeadRepository();
    leads.list_ = [buildLeadSummary()];
    const useCase = new SearchLeadsUseCase(leads);

    const result = await useCase.execute({ query: "Sara" });

    expect(result.isOk && result.value).toHaveLength(1);
  });
});
