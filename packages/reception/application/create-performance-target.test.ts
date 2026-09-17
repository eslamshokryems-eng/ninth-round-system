import { describe, expect, it } from "vitest";
import { err, domainError } from "@9thround/shared-kernel";
import { CreatePerformanceTargetUseCase } from "./create-performance-target";
import { buildPerformanceTarget, fakePerformanceTargetRepository } from "./test-helpers";

const input = {
  staffId: "staff-1",
  branchId: "branch-1",
  category: "sales" as const,
  periodType: "monthly" as const,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  targetAmount: 10000,
  notes: null,
};

describe("CreatePerformanceTargetUseCase", () => {
  it("delegates straight to the repository", async () => {
    const targets = fakePerformanceTargetRepository();
    const useCase = new CreatePerformanceTargetUseCase(targets);

    const result = await useCase.execute(input);

    expect(result.isOk && result.value).toEqual(buildPerformanceTarget());
    expect(targets.lastCreateInput).toEqual(input);
  });

  it("propagates a duplicate-target conflict unchanged", async () => {
    const targets = fakePerformanceTargetRepository(
      undefined,
      err(domainError("TARGET_ALREADY_EXISTS", "duplicate")),
    );
    const useCase = new CreatePerformanceTargetUseCase(targets);

    const result = await useCase.execute(input);

    expect(result.isErr && result.error.code).toBe("TARGET_ALREADY_EXISTS");
  });
});
