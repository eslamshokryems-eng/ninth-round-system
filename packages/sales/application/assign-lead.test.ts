import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { AssignLeadUseCase } from "./assign-lead";
import { FakeLeadRepository, fakeLeadRepository } from "./test-helpers";

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

  // The real authorization rule (a sales_employee may only self-claim an
  // unassigned lead; only branch_manager/super_admin may otherwise
  // reassign — see supabase/migrations/20261020000001_lead_assignment_guard.sql)
  // is enforced by a database trigger, which this fake-repository test
  // cannot exercise. What this test does cover: when the database rejects
  // an unauthorized reassignment, the use case must surface that failure
  // rather than reporting success or swallowing the error.
  it("propagates a rejection from the database (e.g. an unauthorized reassignment) as an error result", async () => {
    const leads = new FakeLeadRepository({
      assign: err(domainError("LEAD_ASSIGN_FAILED", "Only a branch manager or super admin can reassign a lead.")),
    });
    const useCase = new AssignLeadUseCase(leads);

    const result = await useCase.execute({ leadId: "lead-1", assignedToId: "profile-2" });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe("LEAD_ASSIGN_FAILED");
    }
  });
});
