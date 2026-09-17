import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { ListPerformanceTargetsUseCase } from "./list-performance-targets";
import { buildPerformanceTarget, fakePerformanceTargetRepository } from "./test-helpers";

describe("ListPerformanceTargetsUseCase", () => {
  it("delegates straight to the repository", async () => {
    const targets = fakePerformanceTargetRepository();
    const useCase = new ListPerformanceTargetsUseCase(targets);
    const input = { branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" };

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual([buildPerformanceTarget()]);
    expect(targets.lastListInput).toEqual(input);
  });

  it("propagates a repository error unchanged", async () => {
    const targets = fakePerformanceTargetRepository(err(domainError("LIST_PERFORMANCE_TARGETS_FAILED", "boom")));
    const useCase = new ListPerformanceTargetsUseCase(targets);

    const result = await useCase.execute({ branchId: "branch-1", startDate: "2026-09-01", endDate: "2026-09-30" });

    expect(result.isErr && result.error.code).toBe("LIST_PERFORMANCE_TARGETS_FAILED");
  });
});
