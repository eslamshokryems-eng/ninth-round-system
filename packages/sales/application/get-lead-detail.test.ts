import { describe, expect, it } from "vitest";
import { GetLeadDetailUseCase } from "./get-lead-detail";
import { fakeLeadRepository } from "./test-helpers";

describe("GetLeadDetailUseCase", () => {
  it("delegates straight to the repository", async () => {
    const leads = fakeLeadRepository();
    const useCase = new GetLeadDetailUseCase(leads);

    const result = await useCase.execute("lead-1");

    expect(result.isOk && result.value.leadId).toBe("lead-1");
  });
});
