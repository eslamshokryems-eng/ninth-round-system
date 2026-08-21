import { describe, expect, it } from "vitest";
import { ListTodaysFollowupsUseCase } from "./list-todays-followups";
import { buildLeadFollowup, fakeLeadFollowupRepository } from "./test-helpers";

describe("ListTodaysFollowupsUseCase", () => {
  it("delegates to listDueToday()", async () => {
    const followups = fakeLeadFollowupRepository();
    followups.dueToday = [buildLeadFollowup()];
    const useCase = new ListTodaysFollowupsUseCase(followups);

    const result = await useCase.execute();

    expect(result.isOk && result.value).toHaveLength(1);
  });
});
