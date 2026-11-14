import { describe, expect, it } from "vitest";
import { AssignLeadUseCase } from "./assign-lead";
import { fakeLeadRepository } from "./test-helpers";

describe("AssignLeadUseCase", () => {
  it("assigns a lead to a salesperson with the reason (audited)", async () => {
    const leads = fakeLeadRepository();
    const result = await new AssignLeadUseCase(leads).execute({ leadId: "lead-1", assignedToId: "profile-2", reason: " new owner " });
    expect(result.isOk).toBe(true);
    expect(leads.lastAssign).toEqual({ leadId: "lead-1", assignedToId: "profile-2", reason: "new owner" });
  });

  it("refuses without a reason — every reassignment must say why", async () => {
    const leads = fakeLeadRepository();
    const result = await new AssignLeadUseCase(leads).execute({ leadId: "lead-1", assignedToId: "profile-2", reason: "  " });
    expect(result.isErr && result.error.code).toBe("ASSIGN_REASON_REQUIRED");
    expect(leads.lastAssign).toBeNull();
  });

  it("refuses without an owner (leads are not unassigned back to the pool)", async () => {
    const leads = fakeLeadRepository();
    const result = await new AssignLeadUseCase(leads).execute({ leadId: "lead-1", assignedToId: "", reason: "x" });
    expect(result.isErr && result.error.code).toBe("ASSIGNEE_REQUIRED");
  });
});
