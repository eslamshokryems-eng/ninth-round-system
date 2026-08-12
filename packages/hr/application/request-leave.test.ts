import { describe, expect, it } from "vitest";
import { RequestLeaveUseCase } from "./request-leave";
import { InMemoryLeaveRequestRepository } from "./test-helpers";

describe("RequestLeaveUseCase", () => {
  const baseInput = {
    profileId: "profile-1",
    branchId: "branch-1",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    reason: "Family trip",
  };

  it("creates a pending leave request", async () => {
    const useCase = new RequestLeaveUseCase(new InMemoryLeaveRequestRepository());
    const result = await useCase.execute(baseInput);
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.status).toBe("pending");
  });

  it("rejects an empty reason", async () => {
    const useCase = new RequestLeaveUseCase(new InMemoryLeaveRequestRepository());
    const result = await useCase.execute({ ...baseInput, reason: "   " });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("LEAVE_REASON_REQUIRED");
  });

  it("rejects an end date before the start date", async () => {
    const useCase = new RequestLeaveUseCase(new InMemoryLeaveRequestRepository());
    const result = await useCase.execute({ ...baseInput, startDate: "2026-09-05", endDate: "2026-09-01" });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("INVALID_LEAVE_RANGE");
  });
});
