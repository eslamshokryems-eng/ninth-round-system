import { describe, expect, it } from "vitest";
import { CreateShiftUseCase } from "./create-shift";
import { InMemoryShiftRepository } from "./test-helpers";

describe("CreateShiftUseCase", () => {
  const baseInput = {
    profileId: "profile-1",
    branchId: "branch-1",
    dayOfWeek: 1 as const,
    startTime: "09:00",
    endTime: "17:00",
  };

  it("creates a shift with valid times", async () => {
    const useCase = new CreateShiftUseCase(new InMemoryShiftRepository());
    const result = await useCase.execute(baseInput);
    expect(result.isOk).toBe(true);
  });

  it("rejects an end time before start time", async () => {
    const useCase = new CreateShiftUseCase(new InMemoryShiftRepository());
    const result = await useCase.execute({ ...baseInput, startTime: "17:00", endTime: "09:00" });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("INVALID_SHIFT_RANGE");
  });

  it("rejects a malformed time string", async () => {
    const useCase = new CreateShiftUseCase(new InMemoryShiftRepository());
    const result = await useCase.execute({ ...baseInput, startTime: "9am" });
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("INVALID_SHIFT_TIME");
  });
});
