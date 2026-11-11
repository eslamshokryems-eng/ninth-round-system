import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateReviewDecision, validateReviewerIsNotAuthor } from "../domain/challenge-result-review";
import type { ChallengeResultRepository, ReviewChallengeResultInput } from "../domain/challenge-result-repository";

export interface ReviewChallengeResultUseCaseInput extends ReviewChallengeResultInput {
  reviewerProfileId: string;
  resultAuthorProfileId: string;
}

/**
 * Shared base for Approve/Reject — the only difference between the two is
 * which repository method and which decision get validated/persisted
 * (spec §7: a coach can never approve or reject their own submitted
 * result; the real gate is approve_challenge_result()/
 * reject_challenge_result()'s own re-check, same "client validates too"
 * pattern used throughout this codebase).
 */
abstract class ReviewChallengeResultUseCase implements UseCase<ReviewChallengeResultUseCaseInput, void> {
  protected constructor(protected readonly results: ChallengeResultRepository) {}

  protected abstract readonly decision: "approved" | "rejected";
  protected abstract persist(input: ReviewChallengeResultInput): Promise<Result<void>>;

  async execute(input: ReviewChallengeResultUseCaseInput): Promise<Result<void>> {
    const authorCheck = validateReviewerIsNotAuthor(input.reviewerProfileId, input.resultAuthorProfileId);
    if (authorCheck.isErr) return authorCheck;

    const decisionCheck = validateReviewDecision(this.decision, input.notes);
    if (decisionCheck.isErr) return decisionCheck;

    return this.persist(input);
  }
}

export class ApproveChallengeResultUseCase extends ReviewChallengeResultUseCase {
  protected readonly decision = "approved" as const;

  constructor(results: ChallengeResultRepository) {
    super(results);
  }

  protected persist(input: ReviewChallengeResultInput): Promise<Result<void>> {
    return this.results.approve(input);
  }
}

export class RejectChallengeResultUseCase extends ReviewChallengeResultUseCase {
  protected readonly decision = "rejected" as const;

  constructor(results: ChallengeResultRepository) {
    super(results);
  }

  protected persist(input: ReviewChallengeResultInput): Promise<Result<void>> {
    return this.results.reject(input);
  }
}
