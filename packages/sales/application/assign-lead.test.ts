import { describe, expect, it } from "vitest";
import { AssignLeadUseCase } from "./assign-lead";
import { fakeLeadRepository } from "./test-helpers";

describe("AssignLeadUseCase", () => {
  it("assigns a lead to a salesperson", async () => {
    const leads = fakeLeadRepository();
    const useCase = new AssignLeadUseCase(leads);

    const result = await useCase.execute({ leadId: "lead-1", assignedToId: "profile-2" });

    expect(result.isOk).toBe(true);
    expect(leads.lastAssign).toEqual({ leadId: "lead-1", assignedToId: "profile-2" });
  });

  it("also covers unassigning (null) — puts the lead back in the shared pickup queue", async () => {
    const leads = fakeLeadRepository();
    const useCase = new AssignLeadUseCase(leads);

    const result = await useCase.execute({ leadId: "lead-1", assignedToId: null });

    expect(result.isOk).toBe(true);
    expect(leads.lastAssign).toEqual({ leadId: "lead-1", assignedToId: null });
  });
});
