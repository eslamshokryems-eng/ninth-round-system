import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateDisplayName } from "../domain/challenge-display-name";
import type { ChallengeDisplayName } from "../domain/challenge-display-name";
import type { ChallengeDisplayNameRepository } from "../domain/challenge-display-name-repository";

export interface SetChallengeDisplayNameInput {
  displayName: string;
}

/**
 * Account-level — one Challenges display name per authenticated user,
 * shown on every competition and season leaderboard. The caller's own
 * identity is always auth.uid() server-side (set_challenge_display_name()
 * never takes a client-supplied profile id), so this use case needs no
 * profileId input at all.
 */
export class SetChallengeDisplayNameUseCase implements UseCase<SetChallengeDisplayNameInput, void> {
  constructor(private readonly displayNames: ChallengeDisplayNameRepository) {}

  async execute(input: SetChallengeDisplayNameInput): Promise<Result<void>> {
    const nameResult = validateDisplayName(input.displayName);
    if (nameResult.isErr) return nameResult;

    return this.displayNames.setOwn(nameResult.value);
  }
}

/**
 * The caller's current display name, or null if they have never set one.
 * A member must have one before they can request to join a competition
 * (request_challenge_participation() refuses otherwise), so the member
 * screens read this first to decide whether to prompt.
 */
export class GetOwnChallengeDisplayNameUseCase implements UseCase<void, ChallengeDisplayName | null> {
  constructor(private readonly displayNames: ChallengeDisplayNameRepository) {}

  async execute(): Promise<Result<ChallengeDisplayName | null>> {
    return this.displayNames.getOwn();
  }
}

