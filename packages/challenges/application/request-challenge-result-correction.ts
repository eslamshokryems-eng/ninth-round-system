import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateIsDesignatedCoach } from "../domain/challenge-coach-assignment";
import type { ChallengeResultRepository, RequestChallengeResultCorrectionInput } from "../domain/challenge-result-repository";

export interface RequestChallengeResultCorrectionUseCaseInput extends RequestChallengeResultCorrectionInput {
  requestedByProfileId: string;
  /** The original result's participant's currently designated coach — the caller already has the participant loaded (it's offering a "request correction" action on their result), so it's supplied directly rather than requiring a second lookup here. */
  designatedCoachId: string | null;
}

/**
 * Same designated-coach gate as submitting an original result — a
 * correction is always a new row proposing to replace the current one,
 * never an edit of it (see challenge-result.ts). The uniqueness of "one
 * pending correction per original" is enforced by the database's partial
 * unique index, not here.
 */
export class RequestChallengeResultCorrectionUseCase
  implements UseCase<RequestChallengeResultCorrectionUseCaseInput, { resultId: string }>
{
  constructor(private readonly results: ChallengeResultRepository) {}

  async execute(input: RequestChallengeResultCorrectionUseCaseInput): Promise<Result<{ resultId: string }>> {
    const coachResult = validateIsDesignatedCoach(input.designatedCoachId, input.requestedByProfileId);
    if (coachResult.isErr) return coachResult;

    return this.results.requestCorrection(input);
  }
}
