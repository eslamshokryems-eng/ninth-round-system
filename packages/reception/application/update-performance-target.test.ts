import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { UpdatePerformanceTargetUseCase } from "./update-performance-target";
import { buildPerformanceTarget, fakePerformanceTargetRepository } from "./test-helpers";

describe("UpdatePerformanceTargetUseCase", () => {
  it("delegates straight to the repository", async () => {
    const targets = fakePerformanceTargetRepository();
    const useCase = new UpdatePerformanceTargetUseCase(targets);
    const input = { id: "target-1", targetAmount: 12000, notes: "Raised after Q3 review" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual(buildPerformanceTarget());
    expect(targets.lastUpdateInput).toEqual(input);
  });

  it("propagates a repository error unchanged", async () => {
    const targets = fakePerformanceTargetRepository(undefined, err(domainError("UPDATE_PERFORMANCE_TARGET_FAILED", "boom")));
    const useCase = new UpdatePerformanceTargetUseCase(targets);

    const result = await useCase.execute({ id: "target-1", targetAmount: 12000, notes: null });

    expect(result.isErr && result.error.code).toBe("UPDATE_PERFORMANCE_TARGET_FAILED");
  });
});
