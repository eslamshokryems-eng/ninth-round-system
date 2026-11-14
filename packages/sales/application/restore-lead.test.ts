import { describe, expect, it } from "vitest";
import { RestoreLeadUseCase } from "./restore-lead";
import { fakeLeadRepository } from "./test-helpers";

describe("RestoreLeadUseCase (reopen a lost lead)", () => {
  it("reopens with the next action scheduled in the same step", async () => {
    const leads = fakeLeadRepository();
    const nextAt = new Date(Date.now() + 86_400_000);
    const result = await new RestoreLeadUseCase(leads).execute({ leadId: "lead-1", nextKind: "call", nextAt, note: null });
    expect(result.isOk).toBe(true);
    expect(leads.lastRestore).toEqual({ leadId: "lead-1", nextKind: "call", nextAt, note: null });
  });

  it("refuses a next action in the past", async () => {
    const leads = fakeLeadRepository();
    const result = await new RestoreLeadUseCase(leads).execute({ leadId: "lead-1", nextKind: "call", nextAt: new Date(Date.now() - 86_400_000), note: null });
    expect(result.isErr && result.error.code).toBe("NEXT_ACTION_IN_PAST");
    expect(leads.lastRestore).toBeNull();
  });

  it("refuses an invalid date", async () => {
    const result = await new RestoreLeadUseCase(fakeLeadRepository()).execute({ leadId: "lead-1", nextKind: "call", nextAt: new Date("x"), note: null });
    expect(result.isErr && result.error.code).toBe("NEXT_ACTION_REQUIRED");
  });
});
