import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateIsDesignatedCoach } from "../domain/challenge-coach-assignment";
import type { ChallengeResultRepository, SubmitChallengeResultInput } from "../domain/challenge-result-repository";

export interface SubmitChallengeResultUseCaseInput extends SubmitChallengeResultInput {
  enteredByProfileId: string;
  /** The participant's currently designated coach (challenge_participants.designatedCoachId) — the caller already has the participant loaded, so this is supplied directly rather than requiring a second lookup here. Null if no coach has been designated yet. */
  designatedCoachId: string | null;
}

/**
 * Only the participant's designated coach may submit — checked here as
 * defense-in-depth client validation; submit_challenge_result() re-checks
 * the same thing server-side and rejects if the caller isn't it. There is
 * no automatic resolution through gym memberships any more (per the MVP
 * simplification) — a participant with no designated coach yet simply
 * blocks with a clear, actionable message.
 */
export class SubmitChallengeResultUseCase implements UseCase<SubmitChallengeResultUseCaseInput, { resultId: string }> {
  constructor(private readonly results: ChallengeResultRepository) {}

  async execute(input: SubmitChallengeResultUseCaseInput): Promise<Result<{ resultId: string }>> {
    const coachResult = validateIsDesignatedCoach(input.designatedCoachId, input.enteredByProfileId);
    if (coachResult.isErr) return coachResult;

    return this.results.submit(input);
  }
}
