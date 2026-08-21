import { describe, expect, it } from "vitest";
import { ListOverdueFollowupsUseCase } from "./list-overdue-followups";
import { buildLeadFollowup, fakeLeadFollowupRepository } from "./test-helpers";

describe("ListOverdueFollowupsUseCase", () => {
  it("delegates to listOverdue()", async () => {
    const followups = fakeLeadFollowupRepository();
    followups.overdue = [buildLeadFollowup({ followupId: "followup-overdue" })];
    const useCase = new ListOverdueFollowupsUseCase(followups);

    const result = await useCase.execute();

    expect(result.isOk && result.value[0]?.followupId).toBe("followup-overdue");
  });
});
