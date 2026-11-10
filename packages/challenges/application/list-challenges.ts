import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeBranchOption, ChallengeDetail, ChallengeListItem } from "../domain/challenge-queries";
import type { ChallengeRepository } from "../domain/challenge-repository";

/**
 * Backs both the staff console's competition list and the member's browse
 * page. There is deliberately only ONE use case for both: the row-level
 * policies already decide that a customer sees published competitions
 * while a draft stays with its creator and in-scope staff, so a separate
 * "member" query would only be a second, weaker copy of that rule.
 */
export class ListChallengesUseCase implements UseCase<void, ChallengeListItem[]> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(): Promise<Result<ChallengeListItem[]>> {
    return this.challenges.list();
  }
}

/** The competition detail page. Resolves to null when the caller may not see it, which is not an error. */
export class GetChallengeDetailUseCase implements UseCase<string, ChallengeDetail | null> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(challengeId: string): Promise<Result<ChallengeDetail | null>> {
    return this.challenges.getDetail(challengeId);
  }
}

/** Branch options for the create form's BRANCH / MULTI_BRANCH pickers. */
export class ListChallengeBranchesUseCase implements UseCase<void, ChallengeBranchOption[]> {
  constructor(private readonly challenges: ChallengeRepository) {}

  async execute(): Promise<Result<ChallengeBranchOption[]>> {
    return this.challenges.listBranches();
  }
}
