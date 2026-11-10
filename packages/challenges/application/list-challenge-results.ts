import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeResultRow , ChallengeResultReviewRow } from "../domain/challenge-queries";
import type { ChallengeResultRepository } from "../domain/challenge-result-repository";

/** The review desk's queue for one competition — every status the caller is entitled to see. */
export class ListChallengeResultsUseCase implements UseCase<string, ChallengeResultRow[]> {
  constructor(private readonly results: ChallengeResultRepository) {}

  async execute(challengeId: string): Promise<Result<ChallengeResultRow[]>> {
    return this.results.listForChallenge(challengeId);
  }
}

/** A member's own submission history and its current status. */
export class ListOwnChallengeResultsUseCase implements UseCase<void, ChallengeResultRow[]> {
  constructor(private readonly results: ChallengeResultRepository) {}

  async execute(): Promise<Result<ChallengeResultRow[]>> {
    return this.results.listOwn();
  }
}

/** The review decisions (and the notes that explain them) for one competition's results. */
export class ListChallengeResultReviewsUseCase implements UseCase<string, ChallengeResultReviewRow[]> {
  constructor(private readonly results: ChallengeResultRepository) {}

  async execute(challengeId: string): Promise<Result<ChallengeResultReviewRow[]>> {
    return this.results.listReviewsForChallenge(challengeId);
  }
}
