import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { DeletePerformanceTargetUseCase } from "./delete-performance-target";
import { fakePerformanceTargetRepository } from "./test-helpers";

describe("DeletePerformanceTargetUseCase", () => {
  it("delegates straight to the repository", async () => {
    const targets = fakePerformanceTargetRepository();
    const useCase = new DeletePerformanceTargetUseCase(targets);

    const result = await useCase.execute("target-1");

    expect(result.isOk).toBe(true);
    expect(targets.lastRemovedId).toBe("target-1");
  });

  it("propagates a repository error unchanged", async () => {
    const targets = fakePerformanceTargetRepository(undefined, undefined, err(domainError("DELETE_PERFORMANCE_TARGET_FAILED", "boom")));
    const useCase = new DeletePerformanceTargetUseCase(targets);

    const result = await useCase.execute("target-1");

    expect(result.isErr && result.error.code).toBe("DELETE_PERFORMANCE_TARGET_FAILED");
  });
});
