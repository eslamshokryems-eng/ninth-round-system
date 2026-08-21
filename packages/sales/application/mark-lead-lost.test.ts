import { describe, expect, it } from "vitest";
import { MarkLeadLostUseCase } from "./mark-lead-lost";
import { fakeLeadRepository } from "./test-helpers";

describe("MarkLeadLostUseCase", () => {
  it("rejects a missing reason", async () => {
    const useCase = new MarkLeadLostUseCase(fakeLeadRepository());
    // @ts-expect-error deliberately omitting the required reason to verify the guard
    const result = await useCase.execute({ leadId: "lead-1", reason: "", note: null });
    expect(result.isErr && result.error.code).toBe("LOST_REASON_REQUIRED");
  });

  it("delegates a valid mark-lost to the repository", async () => {
    const leads = fakeLeadRepository();
    const useCase = new MarkLeadLostUseCase(leads);

    const result = await useCase.execute({ leadId: "lead-1", reason: "too_expensive", note: "Budget too tight" });

    expect(result.isOk).toBe(true);
    expect(leads.lastMarkLost).toEqual({ leadId: "lead-1", reason: "too_expensive", note: "Budget too tight" });
  });
});
