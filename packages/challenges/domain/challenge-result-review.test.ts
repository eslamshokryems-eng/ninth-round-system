import { describe, expect, it } from "vitest";
import { validateReviewDecision, validateReviewerIsNotAuthor } from "./challenge-result-review";

describe("validateReviewerIsNotAuthor", () => {
  it("rejects a reviewer approving their own submitted result", () => {
    expect(validateReviewerIsNotAuthor("coach-1", "coach-1").isErr).toBe(true);
  });

  it("accepts a different authorized reviewer", () => {
    expect(validateReviewerIsNotAuthor("coach-2", "coach-1").isOk).toBe(true);
  });
});

describe("validateReviewDecision", () => {
  it("requires a reason when rejecting", () => {
    expect(validateReviewDecision("rejected", null).isErr).toBe(true);
    expect(validateReviewDecision("rejected", "   ").isErr).toBe(true);
    expect(validateReviewDecision("rejected", "Invalid technique").isOk).toBe(true);
  });

  it("does not require notes when approving", () => {
    expect(validateReviewDecision("approved", null).isOk).toBe(true);
  });
});
