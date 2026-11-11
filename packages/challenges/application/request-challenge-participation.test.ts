import { describe, expect, it } from "vitest";
import { domainError, err, ok } from "@9thround/shared-kernel";
import { RequestChallengeParticipationUseCase } from "./request-challenge-participation";
import { buildChallengeParticipant, fakeChallengeParticipantRepository, FakeChallengeParticipantRepository } from "./test-helpers";

describe("RequestChallengeParticipationUseCase", () => {
  it("delegates to the repository with the caller's chosen branch and returns whatever auto-decision it made", async () => {
    const participants = fakeChallengeParticipantRepository();
    const useCase = new RequestChallengeParticipationUseCase(participants);

    const result = await useCase.execute({ challengeId: "challenge-1", branchId: "branch-1" });

    expect(result.isOk).toBe(true);
    expect(participants.lastRequestParticipation).toEqual({ challengeId: "challenge-1", branchId: "branch-1" });
  });

  it("passes a null branchId through unchanged for a global competition", async () => {
    const participants = fakeChallengeParticipantRepository();
    const useCase = new RequestChallengeParticipationUseCase(participants);

    await useCase.execute({ challengeId: "challenge-1", branchId: null });

    expect(participants.lastRequestParticipation).toEqual({ challengeId: "challenge-1", branchId: null });
  });

  // request_challenge_participation() auto-approves or auto-rejects
  // server-side in the same call — this use case has no decision logic of
  // its own to test beyond passthrough. An auto-rejection comes back as a
  // normal Ok result (not an error) — eligibility failure is data, not a
  // failure.
  it("surfaces an auto-rejected participation as a successful result carrying the rejection reason", async () => {
    const participants = new FakeChallengeParticipantRepository({
      requestParticipation: ok(buildChallengeParticipant({ status: "rejected", eligibilityResult: false, eligibilityReason: "Minimum age is 18." })),
    });
    const useCase = new RequestChallengeParticipationUseCase(participants);

    const result = await useCase.execute({ challengeId: "challenge-1", branchId: null });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.status).toBe("rejected");
    expect(result.isOk && result.value.eligibilityReason).toBe("Minimum age is 18.");
  });

  // The real eligibility evaluation and auth.uid() identity resolution
  // happen entirely inside request_challenge_participation()'s SQL — a
  // fake repository cannot exercise that. This test only covers that a
  // database rejection (e.g. no display name set, or an already-existing
  // request) propagates as an error rather than being swallowed.
  it("propagates a rejection from the database as an error result", async () => {
    const participants = new FakeChallengeParticipantRepository({
      requestParticipation: err(
        domainError("CHALLENGE_PARTICIPATION_REQUEST_FAILED", "Set a display name before requesting to join a competition."),
      ),
    });
    const useCase = new RequestChallengeParticipationUseCase(participants);

    const result = await useCase.execute({ challengeId: "challenge-1", branchId: null });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_PARTICIPATION_REQUEST_FAILED");
  });
});
