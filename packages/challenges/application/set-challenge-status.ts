import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import { canTransitionChallengeStatus } from "../domain/challenge";
import type { ChallengeStatus } from "../domain/challenge";
import type { ChallengeRepository } from "../domain/challenge-repository";

export interface SetChallengeStatusUseCaseInput {
  challengeId: string;
  /** The status the screen was showing when the user clicked — what the move is validated against. */
  currentStatus: ChallengeStatus;
  nextStatus: ChallengeStatus;
  reason: string | null;
}

/**
 * Moves a competition one step along its lifecycle.
 *
 * The one-step rule is checked here so an impossible request fails without a
 * round trip, but it is checked AGAIN by set_challenge_status() against the
 * status the row actually has — which is the one that counts, since the
 * screen's copy of it may be stale. Who may make the move at all (a branch
 * manager for their own branch's BRANCH competitions, a super admin for any)
 * is likewise decided by that function and never by this use case.
 */
export class SetChallengeStatusUseCase implements UseCase<SetChallengeStatusUseCaseInput, void> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(input: SetChallengeStatusUseCaseInput): Promise<Result<void>> {
    if (!canTransitionChallengeStatus(input.currentStatus, input.nextStatus)) {
      return err(
        domainError(
          "CHALLENGE_STATUS_TRANSITION_INVALID",
          `A competition cannot go from ${input.currentStatus} to ${input.nextStatus}.`,
        ),
      );
    }
    const reason = input.reason?.trim() ? input.reason.trim() : null;
    return this.challenges.setStatus(input.challengeId, input.nextStatus, reason);
  }
}
