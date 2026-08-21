import { describe, expect, it } from "vitest";
import { GetLeadTimelineUseCase } from "./get-lead-timeline";
import { buildLeadTimelineEntry, fakeLeadTimelineRepository } from "./test-helpers";

describe("GetLeadTimelineUseCase", () => {
  it("delegates to the timeline repository (backed by the scoped get_lead_timeline() RPC)", async () => {
    const timeline = fakeLeadTimelineRepository([buildLeadTimelineEntry({ action: "convert_lead" })]);
    const useCase = new GetLeadTimelineUseCase(timeline);

    const result = await useCase.execute("lead-1");

    expect(result.isOk && result.value[0]?.action).toBe("convert_lead");
  });
});
