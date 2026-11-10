import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { ApproveChallengeResultCorrectionUseCase, RejectChallengeResultCorrectionUseCase } from "./review-challenge-result-correction";
import { fakeChallengeResultRepository, FakeChallengeResultRepository } from "./test-helpers";

describe("ApproveChallengeResultCorrectionUseCase", () => {
  it("rejects when the reviewer is the one who requested the correction (self-approval)", async () => {
    const useCase = new ApproveChallengeResultCorrectionUseCase(fakeChallengeResultRepository());

    const result = await useCase.execute({
      resultId: "correction-1",
      notes: null,
      reviewerProfileId: "coach-1",
      correctionRequestedByProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("SELF_APPROVAL_NOT_ALLOWED");
  });

  it("delegates a valid correction approval (by someone other than its requester) to the repository", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new ApproveChallengeResultCorrectionUseCase(results);

    const input = {
      resultId: "correction-1",
      notes: "Confirmed with video review.",
      reviewerProfileId: "branch-manager-1",
      correctionRequestedByProfileId: "coach-1",
    };
    const result = await useCase.execute(input);

    expect(result.isOk).toBe(true);
    expect(results.lastApproveCorrectionInput).toEqual(input);
  });

  // The real role/branch/correction_pending-status checks and the atomic
  // whole-challenge ranking recompute (approve_challenge_result_
  // correction()'s SQL, Phase 2 migration) are the real gate — a fake
  // repository cannot exercise them. This test only covers that a
  // database rejection propagates as an error rather than being swallowed.
  it("propagates a rejection from the database as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      approveCorrection: err(domainError("CHALLENGE_RESULT_CORRECTION_APPROVE_FAILED", "Only a pending correction can be approved.")),
    });
    const useCase = new ApproveChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute({
      resultId: "correction-1",
      notes: null,
      reviewerProfileId: "branch-manager-1",
      correctionRequestedByProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_CORRECTION_APPROVE_FAILED");
  });
});

describe("RejectChallengeResultCorrectionUseCase", () => {
  it("rejects a correction rejection with no notes", async () => {
    const useCase = new RejectChallengeResultCorrectionUseCase(fakeChallengeResultRepository());

    const result = await useCase.execute({
      resultId: "correction-1",
      notes: null,
      reviewerProfileId: "branch-manager-1",
      correctionRequestedByProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("REJECTION_REASON_REQUIRED");
  });

  it("delegates a valid correction rejection (with notes) to the repository", async () => {
    const results = fakeChallengeResultRepository();
    const useCase = new RejectChallengeResultCorrectionUseCase(results);

    const input = {
      resultId: "correction-1",
      notes: "Original result stands.",
      reviewerProfileId: "branch-manager-1",
      correctionRequestedByProfileId: "coach-1",
    };
    const result = await useCase.execute(input);

    expect(result.isOk).toBe(true);
    expect(results.lastRejectCorrectionInput).toEqual(input);
  });

  it("propagates a rejection from the database as an error result", async () => {
    const results = new FakeChallengeResultRepository({
      rejectCorrection: err(domainError("CHALLENGE_RESULT_CORRECTION_REJECT_FAILED", "Only a pending correction can be rejected.")),
    });
    const useCase = new RejectChallengeResultCorrectionUseCase(results);

    const result = await useCase.execute({
      resultId: "correction-1",
      notes: "Original result stands.",
      reviewerProfileId: "branch-manager-1",
      correctionRequestedByProfileId: "coach-1",
    });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_RESULT_CORRECTION_REJECT_FAILED");
  });
});
