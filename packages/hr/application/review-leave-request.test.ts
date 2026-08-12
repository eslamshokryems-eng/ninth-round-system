import { describe, expect, it } from "vitest";
import { ReviewLeaveRequestUseCase } from "./review-leave-request";
import { InMemoryLeaveRequestRepository } from "./test-helpers";

describe("ReviewLeaveRequestUseCase", () => {
  async function seedRequest(repo: InMemoryLeaveRequestRepository) {
    const created = await repo.create({
      profileId: "profile-1",
      branchId: "branch-1",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      reason: "Family trip",
    });
    if (created.isErr) throw new Error("seed failed");
    return created.value.id;
  }

  it("approves a pending request", async () => {
    const repo = new InMemoryLeaveRequestRepository();
    const requestId = await seedRequest(repo);
    const result = await new ReviewLeaveRequestUseCase(repo).execute({
      requestId,
      decision: "approved",
      reviewedBy: "manager-1",
    });
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("approved");
      expect(result.value.reviewedBy).toBe("manager-1");
      expect(result.value.reviewedAt).not.toBeNull();
    }
  });

  it("rejects an invalid decision value", async () => {
    const repo = new InMemoryLeaveRequestRepository();
    const requestId = await seedRequest(repo);
    const result = await new ReviewLeaveRequestUseCase(repo).execute({
      requestId,
      // @ts-expect-error deliberately invalid to test the runtime guard
      decision: "pending",
      reviewedBy: "manager-1",
    });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("INVALID_LEAVE_DECISION");
  });
});
