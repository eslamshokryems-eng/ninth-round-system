import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateReviewDecision, validateReviewerIsNotAuthor } from "../domain/challenge-result-review";
import type { ChallengeResultRepository, ReviewChallengeResultInput } from "../domain/challenge-result-repository";

export interface ReviewChallengeResultCorrectionUseCaseInput extends ReviewChallengeResultInput {
  reviewerProfileId: string;
  correctionRequestedByProfileId: string;
}

/**
 * Approve/reject a pending CORRECTION_PENDING row, never the original it
 * targets. approveCorrection() (Phase 2 migration) recomputes the whole
 * challenge's ranking and writes compensating + new ledger entries for
 * every affected participant, atomically — this use case only gates who
 * may call it, same self-review ban as an original result's review.
 */
abstract class ReviewChallengeResultCorrectionUseCase implements UseCase<ReviewChallengeResultCorrectionUseCaseInput, void> {
  protected constructor(protected readonly results: ChallengeResultRepository) {}

  protected abstract readonly decision: "approved" | "rejected";
  protected abstract persist(input: ReviewChallengeResultInput): Promise<Result<void>>;

  async execute(input: ReviewChallengeResultCorrectionUseCaseInput): Promise<Result<void>> {
    const authorCheck = validateReviewerIsNotAuthor(input.reviewerProfileId, input.correctionRequestedByProfileId);
    if (authorCheck.isErr) return authorCheck;

    const decisionCheck = validateReviewDecision(this.decision, input.notes);
    if (decisionCheck.isErr) return decisionCheck;

    return this.persist(input);
  }
}

export class ApproveChallengeResultCorrectionUseCase extends ReviewChallengeResultCorrectionUseCase {
  protected readonly decision = "approved" as const;

  constructor(results: ChallengeResultRepository) {
    super(results);
  }

  protected persist(input: ReviewChallengeResultInput): Promise<Result<void>> {
    return this.results.approveCorrection(input);
  }
}

export class RejectChallengeResultCorrectionUseCase extends ReviewChallengeResultCorrectionUseCase {
  protected readonly decision = "rejected" as const;

  constructor(results: ChallengeResultRepository) {
    super(results);
  }

  protected persist(input: ReviewChallengeResultInput): Promise<Result<void>> {
    return this.results.rejectCorrection(input);
  }
}
