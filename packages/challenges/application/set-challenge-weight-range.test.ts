import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { SetChallengeWeightRangeUseCase } from "./set-challenge-weight-range";
import { fakeChallengeSettingsRepository, FakeChallengeSettingsRepository } from "./test-helpers";

describe("SetChallengeWeightRangeUseCase", () => {
  it("rejects a non-integer min/max", async () => {
    const useCase = new SetChallengeWeightRangeUseCase(fakeChallengeSettingsRepository());

    const result = await useCase.execute({ min: 1.5, max: 10 });

    expect(result.isErr && result.error.code).toBe("INVALID_WEIGHT_RANGE");
  });

  it("rejects a min below 1", async () => {
    const useCase = new SetChallengeWeightRangeUseCase(fakeChallengeSettingsRepository());

    const result = await useCase.execute({ min: 0, max: 10 });

    expect(result.isErr && result.error.code).toBe("INVALID_WEIGHT_RANGE");
  });

  it("rejects a max below min", async () => {
    const useCase = new SetChallengeWeightRangeUseCase(fakeChallengeSettingsRepository());

    const result = await useCase.execute({ min: 5, max: 4 });

    expect(result.isErr && result.error.code).toBe("INVALID_WEIGHT_RANGE");
  });

  it("delegates a valid range to the repository", async () => {
    const settings = fakeChallengeSettingsRepository();
    const useCase = new SetChallengeWeightRangeUseCase(settings);

    const result = await useCase.execute({ min: 1, max: 15 });

    expect(result.isOk).toBe(true);
    expect(settings.lastSetWeightRange).toEqual({ min: 1, max: 15 });
  });

  // set_challenge_weight_range()'s own is_super_admin() check (Phase 2 SQL
  // migration) is the real authorization gate — a fake repository cannot
  // exercise it. This test only covers that a database rejection
  // propagates as an error rather than being swallowed.
  it("propagates a rejection from the database (e.g. a non-super-admin caller) as an error result", async () => {
    const settings = new FakeChallengeSettingsRepository({
      setWeightRange: err(domainError("CHALLENGE_WEIGHT_RANGE_UPDATE_FAILED", "Only a super admin can change the competition weight range.")),
    });
    const useCase = new SetChallengeWeightRangeUseCase(settings);

    const result = await useCase.execute({ min: 1, max: 10 });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_WEIGHT_RANGE_UPDATE_FAILED");
  });
});
