import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { SubmitChallengeResultUseCase, type SubmitChallengeResultUseCaseInput } from "./submit-challenge-result";
import { buildSubmitChallengeResultInput, fakeChallengeResultRepository, FakeChallengeResultRepository } from "./test-helpers";

function buildInput(overrides: Partial<SubmitChallengeResultUseCaseInput> = {}): SubmitChallengeResultUseCaseInput {
  return {
    ...buildSubmitChallengeResultInput(),
    enteredByProfileId: "coach-1",
    designatedCoachId: "coach-1",
    ...overrides,
  };
}

describe("SubmitChallengeResultUseCase", () => {
  it("submits when the caller is the participant's designated coach", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new SubmitChallengeResultUseCase(results);

    const result = await useCase.execute(buildInput());

    expect(result.isOk).toBe(true);
    expect(results.lastSubmitInput).toEqual(buildInput());
  });

  it("rejects when the caller isn't the designated coach", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new SubmitChallengeResultUseCase(results);

    const result = await useCase.execute(buildInput({ designatedCoachId: "coach-2", enteredByProfileId: "coach-1" }));

    expect(result.isErr && result.error.code).toBe("NOT_DESIGNATED_COACH");
    expect(results.lastSubmitInput).toBeNull();
  });

  it("rejects when no coach has been designated for this participant yet", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new SubmitChallengeResultUseCase(results);

    const result = await useCase.execute(buildInput({ designatedCoachId: null }));

    expect(result.isErr && result.error.code).toBe("NO_COACH_DESIGNATED");
    expect(results.lastSubmitInput).toBeNull();
  });

  // The real challenge-lifecycle-window check and participant-status
  // check (submit_challenge_result()'s SQL) are the real gate — a fake
  // repository cannot exercise them. This test only covers that a
  // database rejection propagates as an error rather than being swallowed.
  it("propagates a rejection from the database (e.g. the challenge isn't active) as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      submit: err(domainError("CHALLENGE_RESULT_SUBMIT_FAILED", "This competition is not open for result submission.")),
    });
    const useCase = new SubmitChallengeResultUseCase(results);

    const result = await useCase.execute(buildInput());

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_SUBMIT_FAILED");
  });

  // Duplicate-original guard (uq_challenge_results_no_duplicate_original)
  // is the real gate — a fake repository cannot exercise it. This test
  // only covers that the use case correctly propagates that specific
  // database rejection as an error rather than silently retrying or
  // swallowing it.
  it("propagates a rejection from the database when the participant already has a current result (duplicate-original guard)", async () => {
    const results = new FakeChallengeResultRepository({
      submit: err(
        domainError(
          "CHALLENGE_RESULT_SUBMIT_FAILED",
          "This participant already has a result for this competition. Use the correction workflow to change it instead of submitting a new one.",
        ),
      ),
    });
    const useCase = new SubmitChallengeResultUseCase(results);

    const result = await useCase.execute(buildInput());

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_SUBMIT_FAILED");
  });
});
