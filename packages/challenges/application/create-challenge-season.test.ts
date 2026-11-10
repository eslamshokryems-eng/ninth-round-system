import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { CreateChallengeSeasonUseCase } from "./create-challenge-season";
import { buildCreateChallengeSeasonInput, fakeChallengeSeasonRepository, FakeChallengeSeasonRepository } from "./test-helpers";

describe("CreateChallengeSeasonUseCase", () => {
  it("rejects an end date that isn't after the start date", async () => {
    const useCase = new CreateChallengeSeasonUseCase(fakeChallengeSeasonRepository());

    const result = await useCase.execute(buildCreateChallengeSeasonInput({ startsAt: "2026-12-01", endsAt: "2026-11-01" }));

    expect(result.isErr && result.error.code).toBe("INVALID_SEASON_RANGE");
  });

  it("rejects an invalid date", async () => {
    const useCase = new CreateChallengeSeasonUseCase(fakeChallengeSeasonRepository());

    const result = await useCase.execute(buildCreateChallengeSeasonInput({ startsAt: "not-a-date" }));

    expect(result.isErr && result.error.code).toBe("INVALID_SEASON_DATES");
  });

  it("delegates a valid season to the repository", async () => {
    const seasons = fakeChallengeSeasonRepository();
    const useCase = new CreateChallengeSeasonUseCase(seasons);

    const result = await useCase.execute(buildCreateChallengeSeasonInput());

    expect(result.isOk).toBe(true);
    expect(seasons.lastCreateInput).toEqual(buildCreateChallengeSeasonInput());
  });

  // create_challenge_season()'s own is_super_admin() check (Phase 2 SQL
  // migration) is the real authorization gate — a fake repository cannot
  // exercise it. This test only covers that a database rejection
  // propagates as an error rather than being swallowed.
  it("propagates a rejection from the database (e.g. a non-super-admin caller) as an error result", async () => {
    const seasons = new FakeChallengeSeasonRepository({
      create: err(domainError("CHALLENGE_SEASON_CREATE_FAILED", "Only a super admin can create a competition season.")),
    });
    const useCase = new CreateChallengeSeasonUseCase(seasons);

    const result = await useCase.execute(buildCreateChallengeSeasonInput());

    expect(result.isErr && result.error.code).toBe("CHALLENGE_SEASON_CREATE_FAILED");
  });
});
