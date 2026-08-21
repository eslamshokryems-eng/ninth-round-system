import { describe, expect, it } from "vitest";
import { RescheduleFollowupUseCase } from "./reschedule-followup";
import { fakeLeadFollowupRepository } from "./test-helpers";

describe("RescheduleFollowupUseCase", () => {
  it("rejects a missing due date/time", async () => {
    const useCase = new RescheduleFollowupUseCase(fakeLeadFollowupRepository());
    const result = await useCase.execute({ followupId: "followup-1", dueAt: "" });
    expect(result.isErr && result.error.code).toBe("DUE_AT_REQUIRED");
  });

  it("delegates a valid reschedule to the repository", async () => {
    const followups = fakeLeadFollowupRepository();
    const useCase = new RescheduleFollowupUseCase(followups);

    const result = await useCase.execute({ followupId: "followup-1", dueAt: "2026-08-25T09:00:00.000Z" });

    expect(result.isOk).toBe(true);
    expect(followups.lastReschedule).toEqual({ followupId: "followup-1", dueAt: "2026-08-25T09:00:00.000Z" });
  });
});
