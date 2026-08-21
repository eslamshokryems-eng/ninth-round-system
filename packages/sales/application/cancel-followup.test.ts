import { describe, expect, it } from "vitest";
import { CancelFollowupUseCase } from "./cancel-followup";
import { fakeLeadFollowupRepository } from "./test-helpers";

describe("CancelFollowupUseCase", () => {
  it("delegates straight to the repository", async () => {
    const followups = fakeLeadFollowupRepository();
    const useCase = new CancelFollowupUseCase(followups);

    const result = await useCase.execute("followup-1");

    expect(result.isOk).toBe(true);
    expect(followups.lastCancelFollowupId).toBe("followup-1");
  });
});
