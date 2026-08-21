import { describe, expect, it } from "vitest";
import { CompleteFollowupUseCase } from "./complete-followup";
import { fakeLeadFollowupRepository } from "./test-helpers";

describe("CompleteFollowupUseCase", () => {
  it("delegates straight to the repository", async () => {
    const followups = fakeLeadFollowupRepository();
    const useCase = new CompleteFollowupUseCase(followups);

    const result = await useCase.execute({ followupId: "followup-1", note: "Interested, will visit Friday" });

    expect(result.isOk).toBe(true);
    expect(followups.lastComplete).toEqual({ followupId: "followup-1", note: "Interested, will visit Friday" });
  });
});
