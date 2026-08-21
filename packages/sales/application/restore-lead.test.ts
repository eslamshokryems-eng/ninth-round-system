import { describe, expect, it } from "vitest";
import { RestoreLeadUseCase } from "./restore-lead";
import { fakeLeadRepository } from "./test-helpers";

describe("RestoreLeadUseCase", () => {
  it("delegates straight to the repository", async () => {
    const leads = fakeLeadRepository();
    const useCase = new RestoreLeadUseCase(leads);

    const result = await useCase.execute("lead-1");

    expect(result.isOk).toBe(true);
    expect(leads.lastRestoreLeadId).toBe("lead-1");
  });
});
