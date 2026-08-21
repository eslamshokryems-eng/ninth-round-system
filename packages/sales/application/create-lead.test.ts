import { describe, expect, it } from "vitest";
import { CreateLeadUseCase } from "./create-lead";
import { buildCreateLeadInput, fakeLeadRepository } from "./test-helpers";

describe("CreateLeadUseCase", () => {
  it("rejects a missing full name", async () => {
    const useCase = new CreateLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildCreateLeadInput({ fullName: "  " }));
    expect(result.isErr && result.error.code).toBe("FULL_NAME_REQUIRED");
  });

  it("rejects a missing phone", async () => {
    const useCase = new CreateLeadUseCase(fakeLeadRepository());
    const result = await useCase.execute(buildCreateLeadInput({ phone: "" }));
    expect(result.isErr && result.error.code).toBe("PHONE_REQUIRED");
  });

  it("delegates a valid lead to the repository", async () => {
    const leads = fakeLeadRepository();
    const useCase = new CreateLeadUseCase(leads);

    const result = await useCase.execute(buildCreateLeadInput());

    expect(result.isOk).toBe(true);
    expect(leads.lastCreateInput?.fullName).toBe("Sara Test");
  });
});
