import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { RequestChallengeResultCorrectionUseCase, type RequestChallengeResultCorrectionUseCaseInput } from "./request-challenge-result-correction";
import { buildRequestChallengeResultCorrectionInput, fakeChallengeResultRepository, FakeChallengeResultRepository } from "./test-helpers";

function buildInput(overrides: Partial<RequestChallengeResultCorrectionUseCaseInput> = {}): RequestChallengeResultCorrectionUseCaseInput {
  return {
    ...buildRequestChallengeResultCorrectionInput(),
    requestedByProfileId: "coach-1",
    designatedCoachId: "coach-1",
    ...overrides,
  };
}

describe("RequestChallengeResultCorrectionUseCase", () => {
  it("requests a correction when the caller is the participant's designated coach", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new RequestChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute(buildInput());

    expect(result.isOk).toBe(true);
    expect(results.lastRequestCorrectionInput).toEqual(buildInput());
  });

  it("rejects when the caller isn't the designated coach", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new RequestChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute(buildInput({ designatedCoachId: "coach-2", requestedByProfileId: "coach-1" }));

    expect(result.isErr && result.error.code).toBe("NOT_DESIGNATED_COACH");
    expect(results.lastRequestCorrectionInput).toBeNull();
  });

  it("rejects when no coach has been designated for this participant yet", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new RequestChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute(buildInput({ designatedCoachId: null }));

    expect(result.isErr && result.error.code).toBe("NO_COACH_DESIGNATED");
  });

  // The real "only the current approved result can be corrected" and
  // "one pending correction at a time" checks (request_challenge_result_
  // correction()'s SQL) are the real gate — a fake repository cannot
  // exercise them. This test only covers that a database rejection
  // propagates as an error rather than being swallowed.
  it("propagates a rejection from the database (e.g. a stale/already-superseded original) as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      requestCorrection: err(
        domainError("CHALLENGE_RESULT_CORRECTION_REQUEST_FAILED", "A correction can only be requested against the current approved result."),
      ),
    });
    const useCase = new RequestChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute(buildInput());

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_CORRECTION_REQUEST_FAILED");
  });
});
