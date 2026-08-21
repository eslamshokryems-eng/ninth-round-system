import { describe, expect, it } from "vitest";
import { CreateFollowupUseCase } from "./create-followup";
import { buildCreateFollowupInput, fakeLeadFollowupRepository } from "./test-helpers";

describe("CreateFollowupUseCase", () => {
  it("rejects a missing due date/time", async () => {
    const useCase = new CreateFollowupUseCase(fakeLeadFollowupRepository());
    const result = await useCase.execute(buildCreateFollowupInput({ dueAt: "" }));
    expect(result.isErr && result.error.code).toBe("DUE_AT_REQUIRED");
  });

  it("delegates a valid follow-up to the repository", async () => {
    const followups = fakeLeadFollowupRepository();
    const useCase = new CreateFollowupUseCase(followups);

    const result = await useCase.execute(buildCreateFollowupInput({ note: "Call back after 5pm" }));

    expect(result.isOk).toBe(true);
    expect(followups.lastCreateInput?.note).toBe("Call back after 5pm");
  });
});
