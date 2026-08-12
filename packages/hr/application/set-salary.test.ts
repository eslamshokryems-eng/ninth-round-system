import { describe, expect, it } from "vitest";
import { SetSalaryUseCase } from "./set-salary";
import { InMemorySalaryRepository } from "./test-helpers";

describe("SetSalaryUseCase", () => {
  const baseInput = {
    profileId: "profile-1",
    branchId: "branch-1",
    monthlyAmount: 8000,
    effectiveFrom: "2026-09-01",
  };

  it("sets a salary with a valid amount", async () => {
    const useCase = new SetSalaryUseCase(new InMemorySalaryRepository());
    const result = await useCase.execute(baseInput);
    expect(result.isOk).toBe(true);
  });

  it("rejects a negative amount", async () => {
    const useCase = new SetSalaryUseCase(new InMemorySalaryRepository());
    const result = await useCase.execute({ ...baseInput, monthlyAmount: -100 });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("INVALID_SALARY_AMOUNT");
  });
});
