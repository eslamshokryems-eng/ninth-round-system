import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { ApproveChallengeResultUseCase, RejectChallengeResultUseCase } from "./review-challenge-result";
import { fakeChallengeResultRepository, FakeChallengeResultRepository } from "./test-helpers";

describe("ApproveChallengeResultUseCase", () => {
  it("rejects when the reviewer is the result's own author (self-approval)", async () => {
    const useCase = new ApproveChallengeResultUseCase(fakeChallengeResultRepository());

    const result = await useCase.execute({ resultId: "result-1", notes: null, reviewerProfileId: "coach-1", resultAuthorProfileId: "coach-1" });

    expect(result.isErr && result.error.code).toBe("SELF_APPROVAL_NOT_ALLOWED");
  });

  it("delegates a valid approval (by someone other than the author) to the repository", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new ApproveChallengeResultUseCase(results);

    const input = { resultId: "result-1", notes: "Looks right.", reviewerProfileId: "coach-2", resultAuthorProfileId: "coach-1" };
    const result = await useCase.execute(input);

    expect(result.isOk).toBe(true);
    expect(results.lastApproveInput).toEqual(input);
  });

  // The real role/branch/pending-status checks (approve_challenge_result()'s
  // SQL, Phase 2 migration) are the real gate — a fake repository cannot
  // exercise them. This test only covers that a database rejection
  // propagates as an error rather than being swallowed.
  it("propagates a rejection from the database as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      approve: err(domainError("CHALLENGE_RESULT_APPROVE_FAILED", "Not authorized to review this result.")),
    });
    const useCase = new ApproveChallengeResultUseCase(results);

    const result = await useCase.execute({ resultId: "result-1", notes: null, reviewerProfileId: "coach-2", resultAuthorProfileId: "coach-1" });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_APPROVE_FAILED");
  });
});

describe("RejectChallengeResultUseCase", () => {
  it("rejects when the reviewer is the result's own author (self-rejection)", async () => {
    const useCase = new RejectChallengeResultUseCase(fakeChallengeResultRepository());

    const result = await useCase.execute({
      resultId: "result-1",
      notes: "Mistake found.",
      reviewerProfileId: "coach-1",
      resultAuthorProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("SELF_APPROVAL_NOT_ALLOWED");
  });

  it("rejects a rejection with no notes", async () => {
    const useCase = new RejectChallengeResultUseCase(fakeChallengeResultRepository());

    const result = await useCase.execute({ resultId: "result-1", notes: null, reviewerProfileId: "coach-2", resultAuthorProfileId: "coach-1" });

    expect(result.isErr && result.error.code).toBe("REJECTION_REASON_REQUIRED");
  });

  it("delegates a valid rejection (with notes, by someone other than the author) to the repository", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new RejectChallengeResultUseCase(results);

    const input = {
      resultId: "result-1",
      notes: "Measurement looks wrong.",
      reviewerProfileId: "coach-2",
      resultAuthorProfileId: "coach-1",
    };
    const result = await useCase.execute(input);

    expect(result.isOk).toBe(true);
    expect(results.lastRejectInput).toEqual(input);
  });

  it("propagates a rejection from the database as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      reject: err(domainError("CHALLENGE_RESULT_REJECT_FAILED", "Only a pending result can be rejected.")),
    });
    const useCase = new RejectChallengeResultUseCase(results);

    const result = await useCase.execute({
      resultId: "result-1",
      notes: "Measurement looks wrong.",
      reviewerProfileId: "coach-2",
      resultAuthorProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_REJECT_FAILED");
  });
});
