import { describe, expect, it } from "vitest";
import { UpdateLeadUseCase } from "./update-lead";
import { buildUpdateLeadInput, fakeLeadRepository } from "./test-helpers";

describe("UpdateLeadUseCase", () => {
  it("rejects a missing full name", async () => {
    const useCase = new UpdateLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildUpdateLeadInput({ fullName: "" }));
    expect(result.isErr && result.error.code).toBe("FULL_NAME_REQUIRED");
  });

  it("rejects a missing phone", async () => {
    const useCase = new UpdateLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildUpdateLeadInput({ phone: " " }));
    expect(result.isErr && result.error.code).toBe("PHONE_REQUIRED");
  });

  it("delegates a valid update to the repository", async () => {
    const leads = fakeLeadRepository();
    const useCase = new UpdateLeadUseCase(leads);

    const result = await useCase.execute(buildUpdateLeadInput({ interestNotes: "Wants a 6-month plan" }));

    expect(result.isOk).toBe(true);
    expect(leads.lastUpdateInput?.interestNotes).toBe("Wants a 6-month plan");
  });
});
