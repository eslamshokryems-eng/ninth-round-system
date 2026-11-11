import { describe, expect, it } from "vitest";
import { domainError, err } from "@9thround/shared-kernel";
import { DesignateChallengeCoachUseCase } from "./designate-challenge-coach";
import { fakeChallengeParticipantRepository, FakeChallengeParticipantRepository } from "./test-helpers";

describe("DesignateChallengeCoachUseCase", () => {
  // Phase 2 security remediation M-2: a designated-coach override must
  // never be silent — enforced here as the client-side half of the
  // defense-in-depth pair; designate_challenge_coach()'s own `p_reason`
  // requirement (Phase 2 SQL migration) is the real gate.
  it("rejects a missing reason", async () => {
    const useCase = new DesignateChallengeCoachUseCase(fakeChallengeParticipantRepository());

    const result = await useCase.execute({ participantId: "participant-1", coachId: "coach-1", reason: "" });

    expect(result.isErr && result.error.code).toBe("COACH_DESIGNATION_REASON_REQUIRED");
  });

  it("rejects a whitespace-only reason", async () => {
    const useCase = new DesignateChallengeCoachUseCase(fakeChallengeParticipantRepository());

    const result = await useCase.execute({ participantId: "participant-1", coachId: "coach-1", reason: "   " });

    expect(result.isErr && result.error.code).toBe("COACH_DESIGNATION_REASON_REQUIRED");
  });

  it("delegates a valid designation (with its reason) to the repository", async () => {
    const participants = fakeChallengeParticipantRepository();
    const useCase = new DesignateChallengeCoachUseCase(participants);

    const result = await useCase.execute({
      participantId: "participant-1",
      coachId: "coach-1",
      reason: "Member's regular coach is on leave this month.",
    });

    expect(result.isOk).toBe(true);
    expect(participants.lastDesignateCoach).toEqual({
      participantId: "participant-1",
      coachId: "coach-1",
      reason: "Member's regular coach is on leave this month.",
    });
  });

  // The real role/branch/coach-role checks (designate_challenge_coach()'s
  // SQL, Phase 2 migration) are the real authorization gate — a fake
  // repository cannot exercise them. This test only covers that a
  // database rejection propagates as an error rather than being swallowed.
  it("propagates a rejection from the database (e.g. target isn't a coach) as an error result", async () => {
    const participants = new FakeChallengeParticipantRepository({
      designateCoach: err(domainError("CHALLENGE_COACH_DESIGNATION_FAILED", "The designated coach must be a profile with the coach role.")),
    });
    const useCase = new DesignateChallengeCoachUseCase(participants);

    const result = await useCase.execute({ participantId: "participant-1", coachId: "not-a-coach", reason: "Testing." });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_COACH_DESIGNATION_FAILED");
  });

  // designate_challenge_coach()'s own branch checks — the caller must be
  // branch staff for the PARTICIPANT's own chosen branch, and the
  // designated coach must belong to that same branch — are the real gate.
  // A fake repository cannot exercise either. This test only covers that
  // the use case correctly propagates that specific database rejection as
  // an error.
  it("propagates a rejection from the database when the designated coach is from a different branch than the participant", async () => {
    const participants = new FakeChallengeParticipantRepository({
      designateCoach: err(
        domainError("CHALLENGE_COACH_DESIGNATION_FAILED", "The designated coach must belong to the same branch as the participant."),
      ),
    });
    const useCase = new DesignateChallengeCoachUseCase(participants);

    const result = await useCase.execute({ participantId: "participant-1", coachId: "coach-from-other-branch", reason: "Testing." });

    expect(result.isErr && result.error.code).toBe("CHALLENGE_COACH_DESIGNATION_FAILED");
  });
});
